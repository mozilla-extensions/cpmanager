#include "crypto.h"

// EncryptBufferCBC    (deprecated/legacy)
//
// data:		data to be encrypted
// len:			number of bytes to encrypt (must be divisible by the largest cipher block size)
// ks:			scheduled key
// iv:			IV
// whitening:	whitening constants

bool
EncryptBufferCBC (unsigned __int32 *data, 
		 unsigned int len,
		 TDES_KEY *ks,
		 unsigned __int32 *iv)
{
	/* IMPORTANT: This function has been deprecated (legacy) */

	unsigned __int32 bufIV[4];
	unsigned __int64 i;
	int blockSize = 8;

	if (len % blockSize) return false;

	//  IV
	bufIV[0] = iv[0];
	bufIV[1] = iv[1];

	// Encrypt each block
	for (i = 0; i < len/blockSize; i++)
	{
		// CBC
		data[0] ^= bufIV[0];
		data[1] ^= bufIV[1];
		// change this for other encryption methods
		TripleDesEncrypt ((byte *)data, (byte *)data, ks, 1);

		// CBC
		bufIV[0] = data[0];
		bufIV[1] = data[1];

		data += blockSize / sizeof(*data);
	}
	return true;
}


// DecryptBufferCBC  (deprecated/legacy)
//
// data:		data to be decrypted
// len:			number of bytes to decrypt (must be divisible by the largest cipher block size)
// ks:			scheduled key
// iv:			IV
// whitening:	whitening constants
// ea:			outer-CBC cascade ID (0 = CBC/inner-CBC)
// cipher:		CBC/inner-CBC cipher ID (0 = outer-CBC)

bool
DecryptBufferCBC (unsigned __int32 *data,
		 unsigned int len,
		 TDES_KEY *ks,
		 unsigned __int32 *iv)
{

	/* IMPORTANT: This function has been deprecated (legacy) */

	unsigned __int32 bufIV[4];
	unsigned __int64 i;
	unsigned __int32 ct[4];
	int blockSize = 8;

	if (len % blockSize) return false;

	//  IV
	bufIV[0] = iv[0];
	bufIV[1] = iv[1];

	// Decrypt each block
	for (i = 0; i < len/blockSize; i++)
	{

		// CBC
		ct[0] = data[0];
		ct[1] = data[1];

		// CBC/inner-CBC
		TripleDesEncrypt ((byte *)data, (byte *)data, ks, 0);

		// CBC
		data[0] ^= bufIV[0];
		data[1] ^= bufIV[1];
		bufIV[0] = ct[0];
		bufIV[1] = ct[1];

		data += blockSize / sizeof(*data);
	}
	return true;
}