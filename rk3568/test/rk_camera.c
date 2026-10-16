/* ==========================================================================
 * rk_camera.c  —  RK3568(OpenHarmony) USB 摄像头抓拍 + HTTP 上传
 *
 * 设计原则：
 *   1. 零第三方依赖：V4L2(内核接口) 抓 MJPEG 帧 + 原生 socket 发 HTTP
 *      —— USB 摄像头(UVC) 绝大多数直接输出 MJPEG，抓到的 buffer 本身就是
 *         完整 JPEG，不需要 libjpeg / ffmpeg / opencv
 *   2. 独立程序：与 rk_uplink 互不影响，可同时运行；STM32 侧零改动
 *
 * 用法(hdc shell)：
 *   /data/rk_camera snap       抓 1 帧存 /data/test.jpg（先验证摄像头）
 *   /data/rk_camera            循环抓拍，每 FRAME_INTERVAL 秒 POST 一帧到电脑
 *
 * 编译：见 WSL 工程 makefile 的 test_camera 目标
 * ========================================================================== */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <linux/videodev2.h>

/* ===================== 参数修改入口 ===================== */
#define CAM_DEV          "/dev/video14" /* 本机实测 USB Camera 采集节点；找不到会自动扫描 video0~15 兜底 */
#define FRAME_INTERVAL   3              /* 上传间隔(秒)。后端 4s 节流一次推理，3s 发帧即可兼顾小程序看流 */

/* —— 上传方式：1=MQTT 直传后端(正式，默认)；0=HTTP 直传测试脚本(调试) —— */
#define UPLOAD_VIA_MQTT  1

/* MQTT(与 rk_uplink.c 同一个 broker，即运行 Java 后端的电脑) */
#define MQTT_HOST        "10.153.135.142"
#define MQTT_PORT        1883
#define MQTT_CLIENT_ID   "rk3568_camera_001"
/* 后端固定订阅 fg/+/camera（见后端 MqttGatewayService），裸 JPEG 二进制 payload */
#define MQTT_CAM_TOPIC   "fg/rk3568_factory_001/camera"

/* HTTP 模式(调试用)：配合 pc_frame_receiver.py，端口 8080 */
#define POST_HOST        "10.153.135.142"
#define POST_PORT        8080
#define POST_PATH        "/upload"
/* ====================================================== */

#define NB_BUFS          4
#define MAX_JPEG         (512 * 1024)   /* 单帧 JPEG 最大 512KB，640x480 MJPEG 通常 30~80KB */

struct mmap_buf {
    void  *start;
    size_t length;
};
static struct mmap_buf s_bufs[NB_BUFS];
static int s_fd = -1;

static int xioctl(int fd, unsigned long req, void *arg)
{
    int r;
    do { r = ioctl(fd, req, arg); } while (r == -1 && errno == EINTR);
    return r;
}

/* 打开指定设备节点并配置为 MJPEG；依次尝试多组分辨率。成功返回 0 */
static int camera_open(const char *dev, int *out_w, int *out_h)
{
    static const struct { int w, h; } modes[] = {
        {640, 480}, {1280, 720}, {320, 240},
    };
    struct v4l2_capability cap;
    struct v4l2_format fmt;

    s_fd = open(dev, O_RDWR);
    if (s_fd < 0) return -1;   /* 节点打不开（权限/不存在）直接跳过 */

    if (xioctl(s_fd, VIDIOC_QUERYCAP, &cap) < 0) { close(s_fd); s_fd = -1; return -1; }

    /* 必须同时支持"视频采集"和"流模式"——RK 内部 codec 节点会被这里过滤掉 */
    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE) ||
        !(cap.capabilities & V4L2_CAP_STREAMING)) {
        close(s_fd); s_fd = -1;
        return -1;
    }
    printf("[cam] %s -> %s\n", dev, cap.card);

    int ok = -1;
    for (int i = 0; i < (int)(sizeof(modes) / sizeof(modes[0])); i++) {
        memset(&fmt, 0, sizeof(fmt));
        fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        fmt.fmt.pix.width       = modes[i].w;
        fmt.fmt.pix.height      = modes[i].h;
        fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
        fmt.fmt.pix.field       = V4L2_FIELD_ANY;
        if (xioctl(s_fd, VIDIOC_S_FMT, &fmt) < 0) continue;
        if (fmt.fmt.pix.pixelformat == V4L2_PIX_FMT_MJPEG) {
            *out_w = fmt.fmt.pix.width;
            *out_h = fmt.fmt.pix.height;
            printf("[cam] MJPEG %dx%d\n", *out_w, *out_h);
            ok = 0;
            break;
        }
    }
    if (ok < 0) {
        fprintf(stderr, "[cam] %s no MJPEG support, skip\n", dev);
        close(s_fd); s_fd = -1;
        return -1;
    }

    /* 申请 MMAP 缓冲区 */
    struct v4l2_requestbuffers req;
    memset(&req, 0, sizeof(req));
    req.count  = NB_BUFS;
    req.type   = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;
    if (xioctl(s_fd, VIDIOC_REQBUFS, &req) < 0) { close(s_fd); s_fd = -1; return -1; }

    for (int i = 0; i < NB_BUFS; i++) {
        struct v4l2_buffer buf;
        memset(&buf, 0, sizeof(buf));
        buf.type   = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index  = i;
        if (xioctl(s_fd, VIDIOC_QUERYBUF, &buf) < 0) { close(s_fd); s_fd = -1; return -1; }
        s_bufs[i].length = buf.length;
        s_bufs[i].start  = mmap(NULL, buf.length, PROT_READ | PROT_WRITE,
                                MAP_SHARED, s_fd, buf.m.offset);
        if (s_bufs[i].start == MAP_FAILED) { close(s_fd); s_fd = -1; return -1; }
        if (xioctl(s_fd, VIDIOC_QBUF, &buf) < 0) { close(s_fd); s_fd = -1; return -1; }
    }

    int type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (xioctl(s_fd, VIDIOC_STREAMON, &type) < 0) { close(s_fd); s_fd = -1; return -1; }
    return 0;
}

/* 抓 1 帧 JPEG 到 out（自动丢前 warmup 帧让画面稳定），返回长度或 -1 */
static int camera_grab(unsigned char *out, int out_max, int warmup)
{
    for (int frame = 0; ; frame++) {
        fd_set fds;
        struct timeval tv;
        tv.tv_sec  = 3;
        tv.tv_usec = 0;
        FD_ZERO(&fds);
        FD_SET(s_fd, &fds);
        int r = select(s_fd + 1, &fds, NULL, NULL, &tv);
        if (r <= 0) { fprintf(stderr, "[cam] grab frame timeout\n"); return -1; }

        struct v4l2_buffer buf;
        memset(&buf, 0, sizeof(buf));
        buf.type   = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        if (xioctl(s_fd, VIDIOC_DQBUF, &buf) < 0) { perror("[cam] DQBUF"); return -1; }

        if (frame >= warmup) {
            size_t len = buf.bytesused;
            unsigned char *p = (unsigned char *)s_bufs[buf.index].start;
            if (len < 4 || p[0] != 0xFF || p[1] != 0xD8) {
                fprintf(stderr, "[cam] not JPEG header (FFD8), drop frame\n");
            } else if ((int)len > out_max) {
                fprintf(stderr, "[cam] frame too large (%zu > %d)\n", len, out_max);
            } else {
                memcpy(out, p, len);
                xioctl(s_fd, VIDIOC_QBUF, &buf);
                return (int)len;
            }
        }
        xioctl(s_fd, VIDIOC_QBUF, &buf);
    }
}

#if !UPLOAD_VIA_MQTT
/* HTTP multipart/form-data POST 一帧 JPEG，返回 0 成功（调试模式：配合 pc_frame_receiver.py） */
static int http_post_jpeg(const unsigned char *jpg, size_t jpg_len)
{
    const char *boundary = "----rk3568cam";
    char part1[512], part2[128], hdr[512];
    int n1 = snprintf(part1, sizeof(part1),
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"file\"; filename=\"frame.jpg\"\r\n"
        "Content-Type: image/jpeg\r\n\r\n", boundary);
    int n2 = snprintf(part2, sizeof(part2), "\r\n--%s--\r\n", boundary);
    long total = (long)n1 + (long)jpg_len + (long)n2;

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) { perror("[http] socket"); return -1; }

    /* 5s 连接/收发超时：防火墙丢包时快速报错，避免无声卡死 */
    struct timeval tv;
    tv.tv_sec  = 5;
    tv.tv_usec = 0;
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(POST_PORT);
    if (inet_pton(AF_INET, POST_HOST, &addr.sin_addr) != 1) {
        fprintf(stderr, "[http] bad IP: %s\n", POST_HOST);
        close(sock); return -1;
    }
    printf("[http] connecting %s:%d ...\n", POST_HOST, POST_PORT);
    fflush(stdout);
    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("[http] connect failed (check: receiver running? firewall allows 8080? same LAN?)");
        close(sock); return -1;
    }
    printf("[http] connected, sending %zu bytes ...\n", jpg_len);
    fflush(stdout);

    int hn = snprintf(hdr, sizeof(hdr),
        "POST %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Content-Type: multipart/form-data; boundary=%s\r\n"
        "Content-Length: %ld\r\n"
        "Connection: close\r\n\r\n",
        POST_PATH, POST_HOST, POST_PORT, boundary, total);

    if (send(sock, hdr, hn, 0) != hn ||
        send(sock, part1, n1, 0) != n1 ||
        send(sock, jpg, jpg_len, 0) != (ssize_t)jpg_len ||
        send(sock, part2, n2, 0) != n2) {
        perror("[http] send failed");
        close(sock); return -1;
    }

    char resp[128] = {0};
    ssize_t rn = recv(sock, resp, sizeof(resp) - 1, 0);
    close(sock);
    if (rn > 0 &&
        (strncmp(resp, "HTTP/1.1 200", 12) == 0 ||
         strncmp(resp, "HTTP/1.0 200", 12) == 0)) {
        printf("[http] upload ok (%zu bytes)\n", jpg_len);
        return 0;
    }
    if (rn <= 0)
        printf("[http] no reply (timeout?)\n");
    else
        printf("[http] server reply: %.32s\n", resp);
    return -1;
}
#endif /* !UPLOAD_VIA_MQTT */

/* ================== 极简 MQTT 3.1.1（仅 CONNECT/CONNACK/PUBLISH 二进制） ==================
 * 后端要求：topic fg/+/camera，payload 为裸 JPEG 字节（含 0x00，不能用 strlen） */
static int s_mqtt_fd = -1;

static int mqtt_send_all(int fd, const unsigned char *buf, int len)
{
    int sent = 0;
    while (sent < len) {
        int n = send(fd, buf + sent, len - sent, 0);
        if (n <= 0) return -1;
        sent += n;
    }
    return 0;
}

static int mqtt_enc_remain(unsigned char *buf, int len)
{
    int n = 0;
    do {
        unsigned char b = len % 128;
        len /= 128;
        if (len) b |= 0x80;
        buf[n++] = b;
    } while (len);
    return n;
}

static int mqtt_connect_broker(void)
{
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("[mqtt] socket"); return -1; }

    struct timeval tv = { 5, 0 };   /* 5s 超时，避免无声卡死 */
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(MQTT_PORT);
    if (inet_pton(AF_INET, MQTT_HOST, &addr.sin_addr) != 1) {
        fprintf(stderr, "[mqtt] bad IP %s\n", MQTT_HOST); close(fd); return -1;
    }
    printf("[mqtt] connecting %s:%d ...\n", MQTT_HOST, MQTT_PORT);
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("[mqtt] connect failed (broker running? firewall allows 1883?)");
        close(fd); return -1;
    }

    /* CONNECT 包：MQTT 3.1.1，clean session，keepalive 60s，匿名 */
    unsigned char pkt[128];
    int p = 0;
    const char *cid = MQTT_CLIENT_ID;
    int cid_len = (int)strlen(cid);
    int var_len = 10 + 2 + cid_len;          /* 协议名(6)+级别(1)+标志(1)+keepalive(2)+clientid(2+len) */
    pkt[p++] = 0x10;                          /* CONNECT */
    p += mqtt_enc_remain(pkt + p, var_len);
    pkt[p++] = 0x00; pkt[p++] = 0x04;         /* 协议名 "MQTT" */
    pkt[p++] = 'M'; pkt[p++] = 'Q'; pkt[p++] = 'T'; pkt[p++] = 'T';
    pkt[p++] = 0x04;                          /* 协议级别 4 = 3.1.1 */
    pkt[p++] = 0x02;                          /* flags: clean session */
    pkt[p++] = 0x00; pkt[p++] = 0x3C;         /* keepalive 60s */
    pkt[p++] = (unsigned char)(cid_len >> 8);
    pkt[p++] = (unsigned char)(cid_len & 0xFF);
    memcpy(pkt + p, cid, cid_len); p += cid_len;

    if (mqtt_send_all(fd, pkt, p) < 0) { perror("[mqtt] send CONNECT"); close(fd); return -1; }

    unsigned char ack[8];
    int n = recv(fd, ack, sizeof(ack), 0);
    if (n < 4 || ack[0] != 0x20 || ack[1] != 0x02 || ack[3] != 0x00) {
        fprintf(stderr, "[mqtt] CONNACK bad (n=%d)\n", n);
        close(fd); return -1;
    }
    printf("[mqtt] connected ok\n");
    return fd;
}

/* 发布二进制消息（QoS 0）。JPEG 含 0x00，必须按长度发，不能按字符串 */
static int mqtt_publish_jpeg(int fd, const unsigned char *jpg, int jpg_len)
{
    int tlen = (int)strlen(MQTT_CAM_TOPIC);
    long body = 2 + tlen + jpg_len;
    unsigned char hdr[8];
    int p = 0;
    hdr[p++] = 0x30;                          /* PUBLISH, QoS 0 */
    p += mqtt_enc_remain(hdr + p, (int)body);
    hdr[p++] = (unsigned char)(tlen >> 8);
    hdr[p++] = (unsigned char)(tlen & 0xFF);

    if (mqtt_send_all(fd, hdr, p) < 0 ||
        mqtt_send_all(fd, (const unsigned char *)MQTT_CAM_TOPIC, tlen) < 0 ||
        mqtt_send_all(fd, jpg, jpg_len) < 0) {
        return -1;
    }
    return 0;
}

static int mqtt_ensure_connected(void)
{
    if (s_mqtt_fd >= 0) return 0;
    s_mqtt_fd = mqtt_connect_broker();
    return (s_mqtt_fd >= 0) ? 0 : -1;
}

static void mqtt_drop(void)
{
    if (s_mqtt_fd >= 0) { close(s_mqtt_fd); s_mqtt_fd = -1; }
}

int main(int argc, char **argv)
{
    int w = 0, h = 0;
    static unsigned char jpg[MAX_JPEG];
    char devpath[32];
    int found = -1;

    setvbuf(stdout, NULL, _IOLBF, 0);   /* 行缓冲：hdc 下日志即时刷新 */
    printf("=== rk_camera start ===\n");
    /* 自动扫描：先试首选节点 CAM_DEV，再依次 /dev/video0..15。
     * RK3568 上 video0~9 很多是内部 codec/RGA 节点，
     * camera_open 会按"支持视频采集+流+MJPEG"自动过滤 */
    if (camera_open(CAM_DEV, &w, &h) == 0) {
        found = 0;
    } else {
        for (int i = 0; i <= 15; i++) {
            snprintf(devpath, sizeof(devpath), "/dev/video%d", i);
            if (strcmp(devpath, CAM_DEV) == 0) continue;   /* 首选已试过 */
            if (camera_open(devpath, &w, &h) == 0) { found = i; break; }
        }
    }
    if (found < 0) {
        fprintf(stderr, "[main] no MJPEG camera found.\n"
                        "       list node names in hdc shell:\n"
                        "       for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; "
                        "do echo video$i: $(cat /sys/class/video4linux/video$i/name 2>/dev/null); done\n");
        return 1;
    }
    printf("[main] camera ready (%dx%d)\n", w, h);

    /* snap 模式：抓 1 帧存文件，hdc file recv 拉回电脑验证摄像头 */
    if (argc > 1 && strcmp(argv[1], "snap") == 0) {
        int len = camera_grab(jpg, sizeof(jpg), 5);
        if (len < 0) return 1;
        FILE *f = fopen("/data/test.jpg", "wb");
        if (!f) { perror("[snap] fopen"); return 1; }
        fwrite(jpg, 1, len, f);
        fclose(f);
        printf("[snap] saved /data/test.jpg (%d bytes)\n", len);
        printf("[snap] pull to PC: hdc file recv /data/test.jpg .\\test.jpg\n");
        return 0;
    }

    /* 默认模式：循环抓拍 + 上传 */
#if UPLOAD_VIA_MQTT
    printf("[main] upload every %d s via MQTT: %s  topic=%s\n",
           FRAME_INTERVAL, MQTT_HOST, MQTT_CAM_TOPIC);
#else
    printf("[main] upload every %d s via HTTP: http://%s:%d%s\n",
           FRAME_INTERVAL, POST_HOST, POST_PORT, POST_PATH);
#endif
    for (;;) {
        int len = camera_grab(jpg, sizeof(jpg), 2);
        if (len > 0) {
            printf("[cam] grabbed %d bytes\n", len);
#if UPLOAD_VIA_MQTT
            if (mqtt_ensure_connected() == 0) {
                if (mqtt_publish_jpeg(s_mqtt_fd, jpg, len) == 0)
                    printf("[mqtt] published %d bytes\n", len);
                else {
                    printf("[mqtt] publish failed, will reconnect next round\n");
                    mqtt_drop();
                }
            }
#else
            http_post_jpeg(jpg, (size_t)len);
#endif
        } else {
            printf("[cam] grab failed, retry after %d s\n", FRAME_INTERVAL);
        }
        sleep(FRAME_INTERVAL);
    }
    return 0;
}
