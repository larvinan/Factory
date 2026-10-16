#ifndef LED_H
#define LED_H
#include "stm32f10x.h"



#define LED_GPIO_PORT GPIOC
#define LED_GPIO_CLK  RCC_APB2Periph_GPIOC
#define LED_GPIO_PIN  GPIO_Pin_13


void LED_Init(void);
void LED_ON(void);
void LED_OFF(void);
#endif
