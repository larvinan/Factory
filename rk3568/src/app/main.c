#include <stdio.h>
#include <unistd.h>
#include "dht11.h"

int main(void)
{
    Dht11Data sensor_data;
    if (dht11_init() != 0)
    {
        printf("DHT11 init failed!\n");
        return -1;
    }

    while (1)
    {
        dht11_read(&sensor_data);
        sleep(2); // DHT11最小间隔2s，不可缩短
    }
    return 0;
}
