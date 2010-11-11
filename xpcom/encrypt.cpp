#include "encrypt.h"
#include "crypto.h"
#include <stdio.h>

char* Encrypt::encrypt ( unsigned char ks[24], unsigned char iv[8],  const char* data, int length)
{
//将字符指针转化为字符数组,且全\0
    memset(buffer,0x00,256);
    memcpy(buffer,data,strlen(data));
//TDES加密    
	TDES_KEY key;
	TripleDesSetKey((byte *)ks,24,&key);
	pkcs5_pad(buffer,length);
	EncryptBufferCBC((unsigned int *)buffer,(length/8+1)*8 ,&key,(unsigned int *)iv);

//base64编码
    base.Encode(buffer,(length/8+1)*8);
    char* res =(char *) base.EncodedMessage();
    return res;
};
char* Encrypt::decrypt ( unsigned char ks[24], unsigned char iv[8], const char* data)
{
//base64解码
    int length = base.Decode(data);
    char* datarea=(char *) base.DecodedMessage();
//将字符指针转化为字符数组
    memcpy(buffer,datarea,length);
//DES解密
	TDES_KEY key;
	TripleDesSetKey((byte *)ks,24,&key);
	DecryptBufferCBC((unsigned int *) buffer,length ,&key,(unsigned int *)iv);
	pkcs5_unpad(buffer,length);
    return (char *)buffer;
};

bool Encrypt::pkcs5_pad(unsigned char* buffer, int length){
	int pc = 8 - length%8;
	for (int i=0; i < pc; i++){
		buffer[length+i] = (char)pc;
	}
	return true;
}

bool Encrypt::pkcs5_unpad(unsigned char* buffer, int length){
	if (length%8) return false;
	unsigned char pc = buffer[length -1];
	if (pc > '\8') return false;
	for (int i =0; i < pc; i++){
		buffer[length -1 -i] = '\0';
	}
	return true;

}
