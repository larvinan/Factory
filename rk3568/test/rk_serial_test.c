/* ==========================================================================
 * rk_serial_test.c —— 极简串口测试（不依赖任何第三方库）
 *
 * 只做三件事：
 *   1. 用 termios 把 /dev/ttyS3 设置成 115200 8N1 raw 模式
 *   2. 读字节
 *   3. 以十六进制打印到屏幕
 *
 * 编译（交叉编译，只需要 clang/gcc，不需要任何第三方库）：
 *   见下方注释
 *
 * 运行：
 *   ./rk_serial_test
 *   按 Ctrl+C 退出
 * ==========================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <errno.h>

#define SERIAL_DEV   "/dev/ttyS3"
#define BAUD         B115200

int main(void)
{
    int fd = open(SERIAL_DEV, O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) {
        perror("open " SERIAL_DEV);
        return 1;
    }
    printf("[test] opened %s fd=%d\n", SERIAL_DEV, fd);

    struct termios t;
    if (tcgetattr(fd, &t) != 0) {
        perror("tcgetattr");
        close(fd);
        return 1;
    }

    /* 设置波特率 115200 */
    cfsetispeed(&t, BAUD);
    cfsetospeed(&t, BAUD);

    /* 8N1 raw 模式 */
    t.c_cflag &= ~PARENB;
    t.c_cflag &= ~CSTOPB;
    t.c_cflag &= ~CSIZE;
    t.c_cflag |= CS8;
    t.c_cflag &= ~CRTSCTS;
    t.c_cflag |= CREAD | CLOCAL;

    t.c_iflag &= ~(IXON | IXOFF | IXANY | ICRNL | INLCR);
    t.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
    t.c_oflag &= ~OPOST;

    t.c_cc[VMIN]  = 1;
    t.c_cc[VTIME] = 1;

    if (tcsetattr(fd, TCSANOW, &t) != 0) {
        perror("tcsetattr");
        close(fd);
        return 1;
    }
    tcflush(fd, TCIOFLUSH);

    printf("[test] configured 115200 8N1 raw, reading...\n");
    printf("[test] expect AA 05 14 ... BB every 2 seconds\n");
    printf("------------------------------------------\n");

    unsigned char buf[256];
    int total = 0;
    while (1) {
        int n = read(fd, buf, sizeof(buf));
        if (n > 0) {
            for (int i = 0; i < n; i++) {
                printf("%02X ", buf[i]);
                total++;
                if (total % 27 == 0) printf(" | frame boundary\n");
            }
            fflush(stdout);
        } else if (n < 0 && errno != EAGAIN && errno != EINTR) {
            perror("read");
            break;
        }
        usleep(50 * 1000);
    }

    close(fd);
    return 0;
}
