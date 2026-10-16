#include "dht11.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <fcntl.h>

static char gpio_val_path[128];
static char gpio_dir_path[128];
static int val_fd = -1;
static int dir_fd = -1;

// 忙等待微秒延时
static void busy_delay_us(uint32_t us)
{
    struct timespec start, cur;
    clock_gettime(CLOCK_MONOTONIC, &start);
    uint64_t start_us = start.tv_sec * 1000000ULL + start.tv_nsec / 1000;
    while (1)
    {
        clock_gettime(CLOCK_MONOTONIC, &cur);
        uint64_t cur_us = cur.tv_sec * 1000000ULL + cur.tv_nsec / 1000;
        if (cur_us - start_us >= us)
            break;
    }
}

// 获取当前微秒时间戳
static uint64_t get_us(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1000000ULL + t.tv_nsec / 1000;
}

// 设置GPIO方向：1=输出，0=输入（按厂商文档）
static int gpio_set_dir(int is_out)
{
    char c = is_out ? '1' : '0';
    lseek(dir_fd, 0, SEEK_SET);
    write(dir_fd, &c, 1);
    return 0;
}

static int gpio_write(int val)
{
    char c = val ? '1' : '0';
    lseek(val_fd, 0, SEEK_SET);
    write(val_fd, &c, 1);
    return 0;
}

static int gpio_read(void)
{
    char ch;
    lseek(val_fd, 0, SEEK_SET);
    read(val_fd, &ch, 1);
    return (ch == '1') ? 1 : 0;
}

// 等待目标电平，返回0成功，-1超时
static int wait_level(int target, uint32_t timeout_us)
{
    uint64_t start = get_us();
    while (get_us() - start < timeout_us)
    {
        if (gpio_read() == target)
            return 0;
    }
    return -1;
}

int dht11_init(void)
{
    snprintf(gpio_val_path, sizeof(gpio_val_path),
             "/sys/external_gpio/jwsioc_gpio%d", DHT_GPIO_NUM);
    snprintf(gpio_dir_path, sizeof(gpio_dir_path),
             "/sys/external_gpio/jwsioc_inout_gpio%d", DHT_GPIO_NUM);

    val_fd = open(gpio_val_path, O_RDWR);
    dir_fd = open(gpio_dir_path, O_WRONLY);
    if (val_fd < 0 || dir_fd < 0)
    {
        printf("[DHT ERR] open gpio%d node failed\n", DHT_GPIO_NUM);
        return -1;
    }

    // 默认输出高电平，总线空闲
    gpio_set_dir(1);
    gpio_write(1);
    busy_delay_us(10000);
    
    // 预检总线空闲电平
    gpio_set_dir(0);
    if (gpio_read() != 1)
    {
        printf("[DHT WARN] Bus idle level is low, check pull-up resistor\n");
    }
    gpio_set_dir(1);
    
    printf("[DHT] GPIO%d init success (external node)\n", DHT_GPIO_NUM);
    return 0;
}

static int dht11_read_once(Dht11Data *data)
{
    uint8_t buf[5] = {0};

    // 1. 发送起始信号：拉低30ms，确保DHT识别
    gpio_set_dir(1);
    gpio_write(0);
    busy_delay_us(30000);
    gpio_write(1);
    
    // 2. 立刻切换输入，释放总线
    gpio_set_dir(0);

    // 等待DHT拉低应答（应答开始）
    if (wait_level(0, 200) != 0)
    {
        printf("[DEBUG] Fail: wait ACK low timeout\n");
        return -1;
    }
    // 等待DHT拉高应答（应答结束）
    if (wait_level(1, 200) != 0)
    {
        printf("[DEBUG] Fail: ACK high timeout\n");
        return -2;
    }

    // 3. 读取40bit：测量高电平时长判断0/1（核心优化）
    for (int byte = 0; byte < 5; byte++)
    {
        uint8_t val = 0;
        for (int bit = 0; bit < 8; bit++)
        {
            // 等待bit起始低电平
            if (wait_level(0, 100) != 0)
            {
                printf("[DEBUG] Fail: bit start low timeout\n");
                return -3;
            }
            // 等待低电平结束，进入高电平
            if (wait_level(1, 80) != 0)
            {
                printf("[DEBUG] Fail: bit high start timeout\n");
                return -4;
            }
            
            // 测量高电平持续时间
            uint64_t high_start = get_us();
            wait_level(0, 80);
            uint32_t high_us = (uint32_t)(get_us() - high_start);
            
            // DHT11规范：0=26-28us高电平，1=70us高电平
            val <<= 1;
            if (high_us > 40)
                val |= 0x01;
        }
        buf[byte] = val;
    }

    // 4. 校验和验证
    uint8_t sum = buf[0] + buf[1] + buf[2] + buf[3];
    if (sum != buf[4])
    {
        printf("[DEBUG] Fail: checksum error sum=%u recv=%u raw: %02x %02x %02x %02x %02x\n",
               sum, buf[4], buf[0], buf[1], buf[2], buf[3], buf[4]);
        return -5;
    }

    data->hum_int = buf[0];
    data->hum_dec = buf[1];
    data->temp_int = buf[2];
    data->temp_dec = buf[3];
    data->checksum = buf[4];
    return 0;
}

int dht11_read(Dht11Data *data)
{
    for (int retry = 0; retry < 5; retry++)
    {
        int ret = dht11_read_once(data);
        if (ret == 0)
        {
            printf("[DHT OK] Temp:%d.%d C  Hum:%d.%d %%\n",
                   data->temp_int, data->temp_dec,
                   data->hum_int, data->hum_dec);
            return 0;
        }
        busy_delay_us(20000);
    }
    printf("[DHT ERR] All 5 retries failed\n\n");
    return -1;
}
