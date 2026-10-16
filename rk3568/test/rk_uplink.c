/* ==========================================================================
 * rk_uplink.c —— 零第三方依赖版（不依赖 mosquitto / cjson）
 *
 * 功能：
 *   1) 打开 /dev/ttyS3，从 STM32 收 protocol 定义的 Frame_t 二进制帧
 *   2) 解析 DATA_SNAPSHOT 帧，手写 sprintf 拼 JSON
 *   3) 用 socket 手写 MQTT 3.1.1 CONNECT/PUBLISH/SUBSCRIBE 协议
 *   4) 数据推到 MQTT broker 的 "factory/sensor/data" topic
 *   5) 订阅 "factory/device/cmd"，收到 JSON 命令后转成 DATA_CTRL 帧发给 STM32
 *
 * 依赖：仅 POSIX socket / termios / pthread（OpenHarmony 自带）
 *
 * 编译：
 *   aarch64-linux-gnu-gcc -O2 -Wall -static -o rk_uplink rk_uplink.c -lpthread
 *
 * 运行：
 *   ./rk_uplink
 *   按 Ctrl+C 退出
 * ==========================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <errno.h>
#include <time.h>
#include <signal.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

/* ========================= 参数修改入口 ================================= */

/* --- 串口与 STM32 连线 --- */
#define SERIAL_DEV              "/dev/ttyS3"
#define SERIAL_BAUD             B115200

/* --- STM32 协议 (与 protocol.h / bsp_uplink.h 保持一致) --- */
#define FRAME_HEAD              0xAA
#define FRAME_TAIL              0xBB
#define MAX_FRAME_LEN           64
#define DATA_SNAPSHOT           0x05
#define DATA_CTRL               0x10
#define DATA_CTRL_ACK           0x11

/* --- MQTT Broker 参数 ---
 * Broker 部署在后端开发者的 Windows 电脑上（WLAN IP，ipconfig 查看）。
 * 注意：这里必须填 Broker 所在机器的【局域网 IP】，不能填 localhost——
 * localhost 在 RK3568 上指 RK3568 自己。若 PC 换了网络 IP 会变，用 ipconfig 重新查。
 */
#define MQTT_HOST               "10.153.135.142"
#define MQTT_PORT               1883
#define MQTT_CLIENT_ID          "rk3568_factory_001"
#define MQTT_USERNAME           ""          /* 匿名访问，留空 */
#define MQTT_PASSWORD           ""
#define MQTT_TOPIC_DATA         "factory/sensor/data"   /* STM32 → 后端 上报 */
#define MQTT_TOPIC_CMD          "factory/device/cmd"    /* 后端 → STM32 下行命令 */

/* --- 周期 --- */
#define CLOUD_POST_INTERVAL_SEC 2   /* 每 2 秒推一次云，与 STM32 上报 2s 对齐 */

/* ========================= /参数修改入口 ================================ */

/* ---- 协议结构体（与 STM32 端一致） ---- */
#pragma pack(push,1)
typedef struct {
    int16_t  temp_x10;
    int16_t  humi_x10;
    uint16_t mq5_ppm;
    uint16_t mq2_ppm;
    uint8_t  mq5_level;
    uint8_t  mq2_level;
    uint16_t ldr_adc;
    uint8_t  pir_person;
    uint8_t  light_on;
    uint8_t  rgb_color;
    uint8_t  beep_active;
    uint16_t count;
    uint16_t stock;
} Snapshot_t;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct {
    uint8_t  cmd;
    uint8_t  param_u8;
    uint16_t param_u16;
} Ctrl_t;
#pragma pack(pop)

/* ---- 全局句柄 ---- */
static int g_serial_fd = -1;
static int g_mqtt_fd = -1;
static volatile int g_running = 1;
static pthread_mutex_t g_serial_wr_mutex = PTHREAD_MUTEX_INITIALIZER;

/* ========================= 串口层 ========================= */

static int serial_open(const char *dev, speed_t baud)
{
    int fd = open(dev, O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) { perror("open serial"); return -1; }
    struct termios t;
    if (tcgetattr(fd, &t) != 0) { perror("tcgetattr"); close(fd); return -1; }
    cfsetispeed(&t, baud);
    cfsetospeed(&t, baud);
    t.c_cflag &= ~PARENB;
    t.c_cflag &= ~CSTOPB;
    t.c_cflag &= ~CSIZE; t.c_cflag |= CS8;
    t.c_cflag &= ~CRTSCTS;
    t.c_cflag |= CREAD | CLOCAL;
    t.c_iflag &= ~(IXON | IXOFF | IXANY | ICRNL | INLCR);
    t.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
    t.c_oflag &= ~OPOST;
    t.c_cc[VMIN] = 1;
    t.c_cc[VTIME] = 1;
    if (tcsetattr(fd, TCSANOW, &t) != 0) { perror("tcsetattr"); close(fd); return -1; }
    tcflush(fd, TCIOFLUSH);
    return fd;
}

static void serial_write_all(int fd, const uint8_t *buf, int len)
{
    pthread_mutex_lock(&g_serial_wr_mutex);
    int sent = 0;
    while (sent < len) {
        int n = write(fd, buf + sent, len - sent);
        if (n <= 0) { if (errno == EINTR) continue; break; }
        sent += n;
    }
    pthread_mutex_unlock(&g_serial_wr_mutex);
}

/* ========================= 协议帧层 ========================= */

static uint8_t calc_checksum(const uint8_t *d, int n)
{
    uint8_t s = 0; for (int i = 0; i < n; i++) s += d[i]; return s;
}

static int try_extract_frame(const uint8_t *buf, int buf_len,
                             uint8_t *out_type, uint8_t *out_payload, int *out_plen)
{
    if (buf_len < 5) return 0;
    int i = 0;
    for (i = 0; i < buf_len; i++) {
        if (buf[i] != FRAME_HEAD) continue;
        if (i + 3 > buf_len) return 0;
        uint8_t dtype = buf[i+1];
        uint8_t dlen  = buf[i+2];
        if (dlen > MAX_FRAME_LEN) return i+1;
        int total = 3 + dlen + 2;
        if (i + total > buf_len) return 0;
        if (buf[i + total - 1] != FRAME_TAIL) return i+1;
        uint8_t chk_src[256];
        chk_src[0] = dtype; chk_src[1] = dlen;
        memcpy(chk_src+2, buf+i+3, dlen);
        if (calc_checksum(chk_src, 2 + dlen) != buf[i + 3 + dlen]) return i+1;
        *out_type = dtype;
        memcpy(out_payload, buf+i+3, dlen);
        *out_plen = dlen;
        return i + total;
    }
    return buf_len;
}

static int pack_ctrl_frame(uint8_t *out, uint8_t cmd, uint8_t pu8, uint16_t pu16)
{
    Ctrl_t c = { cmd, pu8, pu16 };
    uint8_t head[3] = { FRAME_HEAD, DATA_CTRL, (uint8_t)sizeof(Ctrl_t) };
    uint8_t chk_src[256];
    chk_src[0] = DATA_CTRL;
    chk_src[1] = sizeof(Ctrl_t);
    memcpy(chk_src+2, &c, sizeof(Ctrl_t));
    uint8_t ck = calc_checksum(chk_src, 2 + sizeof(Ctrl_t));
    int idx = 0;
    memcpy(out+idx, head, 3); idx += 3;
    memcpy(out+idx, &c, sizeof(Ctrl_t)); idx += sizeof(Ctrl_t);
    out[idx++] = ck;
    out[idx++] = FRAME_TAIL;
    return idx;
}

/* ========================= MQTT 3.1.1 协议层（纯 socket） ========================= */

/* MQTT 控制包类型 */
#define MQTT_CONNECT     1
#define MQTT_CONNACK     2
#define MQTT_PUBLISH     3
#define MQTT_SUBSCRIBE   8
#define MQTT_SUBACK      9
#define MQTT_PINGREQ    12
#define MQTT_PINGRESP   13

/* 编码剩余长度（MQTT 变长编码） */
static int mqtt_encode_remaining(uint8_t *buf, int len)
{
    int idx = 0;
    while (1) {
        uint8_t b = len & 0x7F;
        len >>= 7;
        if (len > 0) b |= 0x80;
        buf[idx++] = b;
        if (len == 0) break;
    }
    return idx;
}

/* 解码剩余长度，返回长度值，*consumed 为编码字节数 */
static int mqtt_decode_remaining(const uint8_t *buf, int *consumed)
{
    int value = 0, multiplier = 1, i = 0;
    do {
        value += (buf[i] & 0x7F) * multiplier;
        multiplier *= 128;
        i++;
        if (i > 4) return -1;
    } while (buf[i-1] & 0x80);
    *consumed = i;
    return value;
}

/* 发送 CONNECT 包 */
static int mqtt_send_connect(int fd)
{
    uint8_t buf[256];
    int idx = 0;

    /* Variable header */
    /* Protocol Name "MQTT" (len + bytes) */
    buf[idx++] = 0; buf[idx++] = 4; buf[idx++] = 'M'; buf[idx++] = 'Q';
    buf[idx++] = 'T'; buf[idx++] = 'T';
    buf[idx++] = 4;          /* Protocol Level: 4 = MQTT 3.1.1 */
    /* Connect Flags: CleanSession=1, Will=0, User/Pass 按配置 */
    uint8_t flags = 0x02;    /* Clean Session */
    int has_user = (strlen(MQTT_USERNAME) > 0);
    int has_pass = (strlen(MQTT_PASSWORD) > 0);
    if (has_user) flags |= 0x80;
    if (has_pass) flags |= 0x40;
    buf[idx++] = flags;
    buf[idx++] = 0; buf[idx++] = 60;   /* Keep Alive 60s */

    /* Payload: ClientId, [Username], [Password] (各带 2 字节长度前缀) */
    const char *cid = MQTT_CLIENT_ID;
    int cid_len = strlen(cid);
    buf[idx++] = (cid_len >> 8) & 0xFF;
    buf[idx++] = cid_len & 0xFF;
    memcpy(&buf[idx], cid, cid_len); idx += cid_len;

    if (has_user) {
        int ulen = strlen(MQTT_USERNAME);
        buf[idx++] = (ulen >> 8) & 0xFF;
        buf[idx++] = ulen & 0xFF;
        memcpy(&buf[idx], MQTT_USERNAME, ulen); idx += ulen;
    }
    if (has_pass) {
        int plen = strlen(MQTT_PASSWORD);
        buf[idx++] = (plen >> 8) & 0xFF;
        buf[idx++] = plen & 0xFF;
        memcpy(&buf[idx], MQTT_PASSWORD, plen); idx += plen;
    }

    /* Fixed header: CONNECT (0x10) + 剩余长度 */
    uint8_t fixed[5];
    fixed[0] = MQTT_CONNECT << 4;
    int rem_len = mqtt_encode_remaining(fixed + 1, idx);

    /* 拼成完整包发出去 */
    uint8_t packet[256];
    int total = 0;
    memcpy(packet, fixed, 1 + rem_len); total += 1 + rem_len;
    memcpy(packet + total, buf, idx); total += idx;

    int n = send(fd, packet, total, 0);
    if (n != total) {
        fprintf(stderr, "[mqtt] send CONNECT failed: %d (errno=%d)\n", n, errno);
        return -1;
    }
    return 0;
}

/* 等 CONNACK */
static int mqtt_wait_connack(int fd)
{
    uint8_t buf[16];
    int n = recv(fd, buf, sizeof(buf), 0);
    if (n < 4) return -1;
    if ((buf[0] >> 4) != MQTT_CONNACK) {
        fprintf(stderr, "[mqtt] expected CONNACK, got %d\n", buf[0] >> 4);
        return -1;
    }
    if (buf[3] != 0) {
        fprintf(stderr, "[mqtt] connect rejected, code=%d\n", buf[3]);
        return -1;
    }
    return 0;
}

/* 发送 SUBSCRIBE 包 */
static int mqtt_send_subscribe(int fd, const char *topic)
{
    uint8_t buf[256];
    int idx = 0;
    /* Packet Identifier */
    static uint16_t pkt_id = 1;
    buf[idx++] = (pkt_id >> 8) & 0xFF;
    buf[idx++] = pkt_id & 0xFF;
    pkt_id++;

    /* Topic Filter */
    int tlen = strlen(topic);
    buf[idx++] = (tlen >> 8) & 0xFF;
    buf[idx++] = tlen & 0xFF;
    memcpy(&buf[idx], topic, tlen); idx += tlen;
    buf[idx++] = 0;    /* QoS 0 */

    /* Fixed header: SUBSCRIBE (0x82, 因 SUBSCRIBE 要求 bit1=1) */
    uint8_t fixed[5];
    fixed[0] = (MQTT_SUBSCRIBE << 4) | 0x02;
    int rem_len = mqtt_encode_remaining(fixed + 1, idx);

    uint8_t packet[256];
    int total = 0;
    memcpy(packet, fixed, 1 + rem_len); total += 1 + rem_len;
    memcpy(packet + total, buf, idx); total += idx;

    int n = send(fd, packet, total, 0);
    return (n == total) ? 0 : -1;
}

/* 发送 PUBLISH 包 (QoS 0) */
static int mqtt_publish(int fd, const char *topic, const char *payload)
{
    uint8_t buf[1024];
    int idx = 0;

    /* Variable header: Topic */
    int tlen = strlen(topic);
    buf[idx++] = (tlen >> 8) & 0xFF;
    buf[idx++] = tlen & 0xFF;
    memcpy(&buf[idx], topic, tlen); idx += tlen;
    /* QoS 0, 无 Packet Identifier */

    /* Payload */
    int plen = strlen(payload);
    memcpy(&buf[idx], payload, plen); idx += plen;

    /* Fixed header: PUBLISH (0x30, QoS 0) */
    uint8_t fixed[5];
    fixed[0] = MQTT_PUBLISH << 4;
    int rem_len = mqtt_encode_remaining(fixed + 1, idx);

    uint8_t packet[1024];
    int total = 0;
    memcpy(packet, fixed, 1 + rem_len); total += 1 + rem_len;
    memcpy(packet + total, buf, idx); total += idx;

    int n = send(fd, packet, total, 0);
    return (n == total) ? 0 : -1;
}

/* 解析收到的 PUBLISH 包，提取 topic/payload */
static int mqtt_parse_publish(const uint8_t *buf, int len,
                              char *topic, int topic_size,
                              char *payload, int payload_size)
{
    if (len < 4) return -1;
    int tlen = (buf[0] << 8) | buf[1];
    if (2 + tlen > len) return -1;
    int tcopy = (tlen < topic_size - 1) ? tlen : topic_size - 1;
    memcpy(topic, &buf[2], tcopy);
    topic[tcopy] = 0;
    int plen = len - 2 - tlen;
    int pcopy = (plen < payload_size - 1) ? plen : payload_size - 1;
    memcpy(payload, &buf[2 + tlen], pcopy);
    payload[pcopy] = 0;
    return 0;
}

/* 建立 MQTT 连接并订阅 */
static int mqtt_connect_and_subscribe(void)
{
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("socket"); return -1; }

    struct sockaddr_in sa; memset(&sa, 0, sizeof(sa));
    sa.sin_family = AF_INET;
    sa.sin_port = htons(MQTT_PORT);
    if (inet_pton(AF_INET, MQTT_HOST, &sa.sin_addr) != 1) {
        fprintf(stderr, "[mqtt] invalid host %s\n", MQTT_HOST); close(fd); return -1;
    }

    if (connect(fd, (struct sockaddr*)&sa, sizeof(sa)) < 0) {
        perror("connect"); close(fd); return -1;
    }
    printf("[mqtt] TCP connected to %s:%d\n", MQTT_HOST, MQTT_PORT);

    if (mqtt_send_connect(fd) != 0) { close(fd); return -1; }
    if (mqtt_wait_connack(fd) != 0) { close(fd); return -1; }
    printf("[mqtt] CONNECT ok\n");

    if (mqtt_send_subscribe(fd, MQTT_TOPIC_CMD) != 0) { close(fd); return -1; }
    /* 等 SUBACK */
    uint8_t buf[16];
    int n = recv(fd, buf, sizeof(buf), 0);
    if (n < 4 || (buf[0] >> 4) != MQTT_SUBACK) {
        fprintf(stderr, "[mqtt] SUBACK wait failed\n");
        close(fd); return -1;
    }
    printf("[mqtt] subscribed to %s\n", MQTT_TOPIC_CMD);
    return fd;
}

/* ========================= JSON 层（手写，无 cjson） ========================= */

static void snapshot_to_json(const Snapshot_t *s, time_t ts, char *out, int out_size)
{
    snprintf(out, out_size,
        "{\"ts\":%lld,"
        "\"temp\":%.1f,\"humi\":%.1f,"
        "\"mq5_ppm\":%u,\"mq2_ppm\":%u,"
        "\"mq5_level\":%u,\"mq2_level\":%u,"
        "\"ldr_adc\":%u,"
        "\"pir\":%u,\"light_on\":%u,"
        "\"rgb_color\":%u,\"beep\":%u,"
        "\"count\":%u,\"stock\":%u}",
        (long long)ts,
        s->temp_x10 / 10.0, s->humi_x10 / 10.0,
        s->mq5_ppm, s->mq2_ppm,
        s->mq5_level, s->mq2_level,
        s->ldr_adc,
        s->pir_person, s->light_on,
        s->rgb_color, s->beep_active,
        s->count, s->stock);
}

/* 极简 JSON 字段提取：从 json 里找 "key":数字，返回该数字 */
static double json_get_number(const char *json, const char *key)
{
    char pat[64];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return 0;
    p += strlen(pat);
    /* 跳过空白和冒号 */
    while (*p && (*p == ' ' || *p == ':' || *p == '\t')) p++;
    return strtod(p, NULL);
}

static const char *json_get_string(const char *json, const char *key, char *out, int out_size)
{
    char pat[64];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) { out[0] = 0; return out; }
    p += strlen(pat);
    while (*p && (*p == ' ' || *p == ':' || *p == '\t')) p++;
    if (*p != '"') { out[0] = 0; return out; }
    p++;
    int i = 0;
    while (*p && *p != '"' && i < out_size - 1) out[i++] = *p++;
    out[i] = 0;
    return out;
}

/* 处理下行命令 JSON：发 DATA_CTRL 帧给 STM32 */
static void handle_downlink_cmd(int serial_fd, const char *json)
{
    char method[32] = {0};
    json_get_string(json, "method", method, sizeof(method));
    if (method[0] == 0) return;

    uint8_t cmd = 0, pu8 = 0;
    uint16_t pu16 = 0;
    int valid = 1;

    if (strcmp(method, "relay") == 0) {
        cmd = 0x01; pu8 = (uint8_t)json_get_number(json, "val");
    } else if (strcmp(method, "rgb") == 0) {
        cmd = 0x02; pu8 = (uint8_t)json_get_number(json, "val");
    } else if (strcmp(method, "beep") == 0) {
        cmd = 0x03;
        int on  = (int)json_get_number(json, "on_ms");
        int off = (int)json_get_number(json, "off_ms");
        if (on < 0) on = 0;   if (on > 255) on = 255;
        if (off < 0) off = 0; if (off > 255) off = 255;
        pu16 = (uint16_t)((on << 8) | off);
        pu8  = (uint8_t)(on && off ? 1 : 0);
    } else if (strcmp(method, "stock") == 0) {
        cmd = 0x04; pu16 = (uint16_t)json_get_number(json, "val");
    } else if (strcmp(method, "stock_reset") == 0) {
        cmd = 0x05;
    } else valid = 0;

    if (valid) {
        uint8_t frame[32];
        int n = pack_ctrl_frame(frame, cmd, pu8, pu16);
        serial_write_all(serial_fd, frame, n);
        printf("[cmd] %s -> STM32 (%d bytes)\n", method, n);
    } else {
        printf("[cmd] unknown method: %s\n", method);
    }
}

/* ========================= 主循环 ========================= */

static void on_sig(int x){ (void)x; g_running = 0; }

int main(int argc, char **argv)
{
    (void)argc; (void)argv;
    signal(SIGINT, on_sig);
    signal(SIGTERM, on_sig);

    /* 串口 */
    g_serial_fd = serial_open(SERIAL_DEV, SERIAL_BAUD);
    if (g_serial_fd < 0) return 1;
    printf("[main] serial opened: %s\n", SERIAL_DEV);

    /* MQTT 连接（带重连） */
    g_mqtt_fd = mqtt_connect_and_subscribe();
    if (g_mqtt_fd < 0) {
        fprintf(stderr, "[main] mqtt connect failed, retry in main loop\n");
    }

    /* 主循环：读串口 -> 解帧 -> 上云 */
    uint8_t rbuf[4096]; int rlen = 0;
    time_t last_post = 0;
    int mqtt_fail_count = 0;

    while (g_running) {
        /* 1. 读串口 */
        uint8_t tmp[256];
        int n = read(g_serial_fd, tmp, sizeof(tmp));
        if (n > 0) {
            if (rlen + n > (int)sizeof(rbuf)) rlen = 0;
            memcpy(rbuf + rlen, tmp, (size_t)n);
            rlen += n;

            int consumed = 0;
            do {
                uint8_t dtype = 0, payload[MAX_FRAME_LEN+2]; int plen = 0;
                int step = try_extract_frame(rbuf + consumed, rlen - consumed,
                                             &dtype, payload, &plen);
                if (step <= 0) break;
                consumed += step;

                if (dtype == DATA_SNAPSHOT && plen == sizeof(Snapshot_t)) {
                    const Snapshot_t *s = (const Snapshot_t *)payload;
                    time_t now = time(NULL);
                    if (now - last_post >= CLOUD_POST_INTERVAL_SEC) {
                        last_post = now;
                        char json[512];
                        snapshot_to_json(s, now, json, sizeof(json));
                        printf("[snapshot] %s\n", json);

                        if (g_mqtt_fd >= 0) {
                            if (mqtt_publish(g_mqtt_fd, MQTT_TOPIC_DATA, json) == 0) {
                                mqtt_fail_count = 0;
                            } else {
                                fprintf(stderr, "[mqtt] publish failed, will reconnect\n");
                                close(g_mqtt_fd); g_mqtt_fd = -1;
                                mqtt_fail_count++;
                            }
                        } else {
                            mqtt_fail_count++;
                        }
                    }
                } else if (dtype == DATA_CTRL_ACK && plen >= 2) {
                    printf("[ctrl ack] cmd=%02x result=%02x\n", payload[0], payload[1]);
                }
            } while (consumed < rlen);

            int left = rlen - consumed;
            if (left > 0) memmove(rbuf, rbuf + consumed, (size_t)left);
            rlen = left;
        } else if (n < 0 && errno != EAGAIN && errno != EINTR) {
            break;
        }

        /* 2. 检查 MQTT 是否要重连 */
        if (g_mqtt_fd < 0 && mqtt_fail_count < 100) {
            printf("[main] reconnecting MQTT...\n");
            sleep(2);
            g_mqtt_fd = mqtt_connect_and_subscribe();
            if (g_mqtt_fd < 0) mqtt_fail_count++;
            else mqtt_fail_count = 0;
        }

        /* 3. 检查 MQTT 下行命令（非阻塞） */
        if (g_mqtt_fd >= 0) {
            struct timeval tv = {0, 0};   /* 非阻塞 */
            fd_set rfds;
            FD_ZERO(&rfds); FD_SET(g_mqtt_fd, &rfds);
            int rc = select(g_mqtt_fd + 1, &rfds, NULL, NULL, &tv);
            if (rc > 0 && FD_ISSET(g_mqtt_fd, &rfds)) {
                uint8_t mbuf[1024];
                int mn = recv(g_mqtt_fd, mbuf, sizeof(mbuf) - 1, 0);
                if (mn <= 0) {
                    printf("[mqtt] disconnected, will reconnect\n");
                    close(g_mqtt_fd); g_mqtt_fd = -1;
                } else {
                    mbuf[mn] = 0;
                    uint8_t ptype = mbuf[0] >> 4;
                    if (ptype == MQTT_PUBLISH) {
                        int hdr_consumed = 0;
                        int rem_len = mqtt_decode_remaining(mbuf + 1, &hdr_consumed);
                        if (rem_len > 0) {
                            char topic[128], payload[512];
                            if (mqtt_parse_publish(mbuf + 1 + hdr_consumed, rem_len,
                                                   topic, sizeof(topic),
                                                   payload, sizeof(payload)) == 0) {
                                printf("[cmd recv] topic=%s payload=%s\n", topic, payload);
                                handle_downlink_cmd(g_serial_fd, payload);
                            }
                        }
                    } else if (ptype == MQTT_PINGRESP) {
                        /* 心跳响应，忽略 */
                    }
                }
            }
        }

        usleep(20 * 1000);  /* 20ms 轮询 */
    }

    if (g_mqtt_fd >= 0) close(g_mqtt_fd);
    close(g_serial_fd);
    printf("[main] exit\n");
    return 0;
}
