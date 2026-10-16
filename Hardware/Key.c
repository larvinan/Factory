#include "Key.h"
#include "delay.h"


void Key_Init(void) 
{ 
 	GPIO_InitTypeDef GPIO_InitStructure;

 	RCC_APB2PeriphClockCmd(KEY1_PORT_CLK,ENABLE);//使能PORTA,PORTC时钟
	
	GPIO_InitStructure.GPIO_Pin  = KEY1_PORT_PIN|KEY2_PORT_PIN|KEY3_PORT_PIN;
	
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU; //设置成上拉输入
	
 	GPIO_Init(KEY1_PORT, &GPIO_InitStructure);
}

//按键处理函数
//返回按键值
//mode:0,不支持连续按;1,支持连续按;
//0，没有任何按键按下
//1，KEY0按下
//2，KEY1按下
//3，KEY2按下 
//4，KEY3按下
//注意此函数有响应优先级,KEY0>KEY1>KEY2>KEY3!!
uint8_t Key_Scan(uint8_t mode)
{	 
	static uint8_t key_up=1;//按键按松开标志
	if(mode)key_up=1;  //支持连按		  
	if(key_up&&(KEY1==0||KEY2==0||KEY3==0))
	{
		delay_ms(10);//去抖动 
		key_up=0;
		if(KEY1==0)return 1;
		else if(KEY2==0)return 2;
		else if(KEY3==0)return 3;

	}
	else if(KEY1==1&&KEY2==1&&KEY3==1)key_up=1; 	    
 	return 0;// 无按键按下
}
