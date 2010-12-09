#include "comp-impl.h"
#include <windows.h>
#include <stdio.h>
#include <iostream>
#include <string>
#include <vector>
#include <stdlib.h>
#include "encrypt.h"
#include "md5wrapper.h"
#include <iphlpapi.h>
#pragma comment(lib, "IPHLPAPI.lib")
#include <shlobj.h>    // for SHGetFolderPath

#define  MAX_IDE_DRIVES  16
#define  FILE_DEVICE_SCSI              0x0000001b
#define  IOCTL_SCSI_MINIPORT_IDENTIFY  ( ( FILE_DEVICE_SCSI << 16 ) + 0x0501 )

#define  IOCTL_SCSI_MINIPORT 0x0004D008  //  see NTDDSCSI.H for definition

#define  IDENTIFY_BUFFER_SIZE  512
#define  SENDIDLENGTH  ( sizeof( SENDCMDOUTPARAMS ) + IDENTIFY_BUFFER_SIZE )

#define  IDE_ATAPI_IDENTIFY  0xA1  //  Returns ID sector for ATAPI.
#define  IDE_ATA_IDENTIFY    0xEC  //  Returns ID sector for ATA.
#define  DFP_RECEIVE_DRIVE_DATA   0x0007c088

#define NET_CARD_KEY TEXT("System\\CurrentControlSet\\Control\\Network\\{4D36E972-E325-11CE-BFC1-08002BE10318}")

using namespace std;

NS_IMPL_ISUPPORTS1(CUidGenerator, IUidGenerator)

const long MAX_COMMAND_SIZE = 10000;
//获取MAC命令行
wchar_t szFetCmd[] = L"ipconfig /all";
//网卡MAC地址的前导信息
const string str4Search = "Physical Address. . . . . . . . . : ";
const string str4Search2 = "物理地址. . . . . . . . . . . . . : ";


typedef struct _IDSECTOR
{
    USHORT  wGenConfig;
    USHORT  wNumCyls;
    USHORT  wReserved;
    USHORT  wNumHeads;
    USHORT  wBytesPerTrack;
    USHORT  wBytesPerSector;
    USHORT  wSectorsPerTrack;
    USHORT  wVendorUnique[3];
    CHAR    sSerialNumber[20];
    USHORT  wBufferType;
    USHORT  wBufferSize;
    USHORT  wECCSize;
    CHAR    sFirmwareRev[8];
    CHAR    sModelNumber[40];
    USHORT  wMoreVendorUnique;
    USHORT  wDoubleWordIO;
    USHORT  wCapabilities;
    USHORT  wReserved1;
    USHORT  wPIOTiming;
    USHORT  wDMATiming;
    USHORT  wBS;
    USHORT  wNumCurrentCyls;
    USHORT  wNumCurrentHeads;
    USHORT  wNumCurrentSectorsPerTrack;
    ULONG   ulCurrentSectorCapacity;
    USHORT  wMultSectorStuff;
    ULONG   ulTotalAddressableSectors;
    USHORT  wSingleWordDMA;
    USHORT  wMultiWordDMA;
    BYTE    bReserved[128];
} IDSECTOR, *PIDSECTOR;

typedef struct _SRB_IO_CONTROL
{
    ULONG HeaderLength;
    UCHAR Signature[8];
    ULONG Timeout;
    ULONG ControlCode;
    ULONG ReturnCode;
    ULONG Length;
} SRB_IO_CONTROL, *PSRB_IO_CONTROL;

typedef struct _GETVERSIONOUTPARAMS
{
    BYTE bVersion;      // Binary driver version.
    BYTE bRevision;     // Binary driver revision.
    BYTE bReserved;     // Not used.
    BYTE bIDEDeviceMap; // Bit map of IDE devices.
    DWORD fCapabilities; // Bit mask of driver capabilities.
    DWORD dwReserved[4]; // For future use.
} GETVERSIONOUTPARAMS, *PGETVERSIONOUTPARAMS, *LPGETVERSIONOUTPARAMS;

//////////////////////////////////////////////////////////////////////

//结构定义
typedef struct _UNICODE_STRING
{
    USHORT  Length;//长度
    USHORT  MaximumLength;//最大长度
    PWSTR  Buffer;//缓存指针
} UNICODE_STRING,*PUNICODE_STRING;

typedef struct _OBJECT_ATTRIBUTES
{
    ULONG Length;//长度 18h
    HANDLE RootDirectory;//  00000000
    PUNICODE_STRING ObjectName;//指向对象名的指针
    ULONG Attributes;//对象属性00000040h
    PVOID SecurityDescriptor;        // Points to type SECURITY_DESCRIPTOR，0
    PVOID SecurityQualityOfService;  // Points to type SECURITY_QUALITY_OF_SERVICE，0
} OBJECT_ATTRIBUTES;
typedef OBJECT_ATTRIBUTES *POBJECT_ATTRIBUTES;

//函数指针变量类型
typedef DWORD  (__stdcall *ZWOS )( PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES);
typedef DWORD  (__stdcall *ZWMV )( HANDLE,HANDLE,PVOID,ULONG,ULONG,PLARGE_INTEGER,PSIZE_T,DWORD,ULONG,ULONG);
typedef DWORD  (__stdcall *ZWUMV )( HANDLE,PVOID);


CUidGenerator::CUidGenerator()
{
  /* member initializers and constructor code */
}

CUidGenerator::~CUidGenerator()
{
  /* destructor code */
}

////////////////////////////////////////////////////////////////////////////
// 函数名： GetMacByCmd(char *lpszMac)
// 参数：
//      输入： void
//      输出： lpszMac,返回的MAC地址串,长度大于12
// 返回值：
//      TRUE:  获得MAC地址。
//      FALSE: 获取MAC地址失败。
// 过程：
//      1. 创建一个无名管道。
//      2. 创建一个IPCONFIG 的进程，并将输出重定向到管道。
//      3. 从管道获取命令行返回的所有信息放入缓冲区lpszBuffer。
//      4. 从缓冲区lpszBuffer中获得抽取出MAC串。
//
//  提示：可以方便的由此程序获得IP地址等其他信息。
//        对于其他的可以通过其他命令方式得到的信息只需改变strFetCmd 和
//        str4Search的内容即可。
///////////////////////////////////////////////////////////////////////////
BOOL CUidGenerator::getMacByCmd(char *lpszMac, int length)
{
//初始化返回MAC地址缓冲区
	if (length <= 12) return FALSE;
	memset(lpszMac, 0x00, length);
	BOOL bret;
	SECURITY_ATTRIBUTES sa;
	HANDLE hReadPipe,hWritePipe;
	sa.nLength = sizeof(SECURITY_ATTRIBUTES);
	sa.lpSecurityDescriptor = NULL;
	sa.bInheritHandle = TRUE;


//创建管道
	bret = CreatePipe(&hReadPipe, &hWritePipe, &sa, 0);
	if(!bret)
	{
		return FALSE;
	}
	//控制命令行窗口信息
	STARTUPINFO si;
	//返回进程信息
	PROCESS_INFORMATION pi;
	si.cb = sizeof(STARTUPINFO);
	GetStartupInfo(&si);
	si.hStdError = hWritePipe;
	si.hStdOutput = hWritePipe;
	si.wShowWindow = SW_HIDE; //隐藏命令行窗口
	si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
	//创建获取命令行进程
	bret = CreateProcess (NULL, szFetCmd, NULL, NULL, TRUE, 0, NULL,
		  NULL, &si, &pi );

	char szBuffer[MAX_COMMAND_SIZE+1]; //放置命令行输出缓冲区
	string strBuffer;
	if (bret)
	{
		WaitForSingleObject (pi.hProcess, INFINITE);
		unsigned long count;
		CloseHandle(hWritePipe);
		memset(szBuffer, 0x00, sizeof(szBuffer));
		bret  =  ReadFile(hReadPipe,  szBuffer,  MAX_COMMAND_SIZE,  &count,  0);
		if(!bret) {
	   //关闭所有的句柄
			CloseHandle(pi.hProcess);
			CloseHandle(pi.hThread);
			CloseHandle(hReadPipe);
			return FALSE;
		} else {
			strBuffer = szBuffer;
			long ipos;
			ipos = (long) strBuffer.find(str4Search);
			if (ipos != -1){
			//提取MAC地址串
				strBuffer = strBuffer.substr(ipos+str4Search.length());
				ipos = (long)strBuffer.find("\n");
				strBuffer = strBuffer.substr(0, ipos);
			}else {
				ipos = (long)strBuffer.find(str4Search2);
				if (ipos == -1) {
					CloseHandle(pi.hProcess);
					CloseHandle(pi.hThread);
					CloseHandle(hReadPipe);
					return FALSE;
				}
				strBuffer = strBuffer.substr(ipos+str4Search2.length());
				ipos = (long)strBuffer.find("\n");
				strBuffer = strBuffer.substr(0, ipos);
			}
		}
	}
	memset(szBuffer, 0x00, sizeof(szBuffer));
	strcpy_s(szBuffer,10001 , strBuffer.c_str());
	//去掉中间的“00-50-EB-0F-27-82”中间的'-'得到0050EB0F2782
	int j = 0;
	for(int i=0; i< (int)strlen(szBuffer); i++)
	{
		if(szBuffer[i] != '-') {
			lpszMac[j] = szBuffer[i];
			j++;
		}
	}
	//关闭所有的句柄
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	CloseHandle(hReadPipe);
	return TRUE;
}

bool isLocalAdapter(const char * pAdapterName)
{
	BOOL ret_value = FALSE;
	TCHAR szDataBuf[MAX_PATH+1];
	DWORD dwDataLen = MAX_PATH;
	DWORD dwType = REG_SZ;
	HKEY hNetKey = NULL;
	HKEY hLocalNet = NULL;

	if(ERROR_SUCCESS != RegOpenKeyEx(HKEY_LOCAL_MACHINE, NET_CARD_KEY, 0, KEY_READ, &hNetKey))
		return FALSE;
	//sprintf(szDataBuf, "%s\Connection", pAdapterName);
	int len = MultiByteToWideChar(CP_UTF8,0,pAdapterName,-1,NULL,0);
	MultiByteToWideChar(CP_UTF8,0,pAdapterName,len,szDataBuf,len);
	wcscat(szDataBuf,TEXT("\\Connection"));
	if (ERROR_SUCCESS != RegOpenKeyEx(hNetKey ,szDataBuf ,0 ,KEY_READ, &hLocalNet))
	{
		RegCloseKey(hNetKey);
		return FALSE;
	}
	if (ERROR_SUCCESS != RegQueryValueEx(hLocalNet, TEXT("MediaSubType"), 0, &dwType, (BYTE *)szDataBuf, &dwDataLen))
	{
		goto ret;
	}
	if (*((DWORD *)szDataBuf)!=0x01 && *((DWORD *)szDataBuf)!=0x02)  // wire or wireless netadapter
	{
		goto ret;
	}
	dwDataLen = MAX_PATH;
	if (ERROR_SUCCESS != RegQueryValueEx(hLocalNet, TEXT("PnpInstanceID"), 0, &dwType, (BYTE *)szDataBuf, &dwDataLen))
	{
		goto ret;
	}
	if (wcsncmp(szDataBuf, TEXT("PCI"), strlen("PCI")))
		goto ret;
	
	ret_value = TRUE;

ret:
	RegCloseKey(hLocalNet);
	RegCloseKey(hNetKey);

	return ret_value!=0;

}

void getdMacAddresses(std::vector<std::string> &vMacAddresses)
{
    vMacAddresses.clear();
    IP_ADAPTER_INFO AdapterInfo[32];       // Allocate information for up to 32 NICs
    DWORD dwBufLen = sizeof(AdapterInfo);  // Save memory size of buffer
    DWORD dwStatus = GetAdaptersInfo(      // Call GetAdapterInfo
    AdapterInfo,                 // [out] buffer to receive data
    &dwBufLen);                  // [in] size of receive data buffer

    //No network card? Other error?
    if(dwStatus != ERROR_SUCCESS)
        return;
	char *adapterName = AdapterInfo->AdapterName;
	if(!isLocalAdapter(adapterName))
		return;
    PIP_ADAPTER_INFO pAdapterInfo = AdapterInfo;
    char szBuffer[512];
    while(pAdapterInfo)
    {
        if(pAdapterInfo->Type == MIB_IF_TYPE_ETHERNET)
        {
                sprintf_s(szBuffer, sizeof(szBuffer), "%.2x-%.2x-%.2x-%.2x-%.2x-%.2x"
                        , pAdapterInfo->Address[0]
                        , pAdapterInfo->Address[1]
                        , pAdapterInfo->Address[2]
                        , pAdapterInfo->Address[3]
                        , pAdapterInfo->Address[4]
                        , pAdapterInfo->Address[5]
                        );
                vMacAddresses.push_back(szBuffer);
        }
        pAdapterInfo = pAdapterInfo->Next;

    }
}

////////////////////////////////////////////////////////////////////////////
// 函数名： getMacAddress(char *lpszMac)
// 参数：
//      输入： void
//      输出： lpszMac,返回的MAC地址串,长度大于12
// 返回值：
//      TRUE:  获得MAC地址。
//      FALSE: 获取MAC地址失败。
// 过程：
//
//	    1. 创建一个无名管道。
//      2. 创建一个IPCONFIG 的进程，并将输出重定向到管道。
//      3. 从管道获取命令行返回的所有信息放入缓冲区lpszBuffer。
//      4. 从缓冲区lpszBuffer中获得抽取出MAC串。
//
//  提示：可以方便的由此程序获得IP地址等其他信息。
//        对于其他的可以通过其他命令方式得到的信息只需改变strFetCmd 和
//        str4Search的内容即可。
///////////////////////////////////////////////////////////////////////////
BOOL getMacAddress(char *lpszMac, int length){
	if (length <= 12) return FALSE;
	memset(lpszMac, 0x00, length);
	std::vector<std::string> addresses;
	getdMacAddresses(addresses);
	for (int i=0; i< addresses.size(); i++){
//		if (addresses[i].find("00-05-56") == 0){
//			continue;
//		}
		for(int j=0,k=0; j< addresses[i].length(); j++)		{
			if(addresses[i][j] != '-') {
				lpszMac[k] = addresses[i][j];
				k++;
			}
		}
		return TRUE;
	}
	return FALSE;
}


////////////////////////////////////////////////////////////////////////////
// 函数名： GetCPUID(char *lpszCPUID)
// 参数：
//      输入： void
//      输出： lpszCPUID,返回的CPUID地址串,长度需要大于24
// 返回值：
//      TRUE:  获得MAC地址。
//      FALSE: 获取MAC地址失败。
///////////////////////////////////////////////////////////////////////////
BOOL CUidGenerator::getCPUID(char *lpszCPUID, int length){
	if (length <= 24) return FALSE;
	memset(lpszCPUID, 0x00, length);

    BOOL bException = FALSE;

//detect whether cpuid is supported
	BOOL found_sn;
	__try{
		_asm
		{
			pushfd
			pop eax // get EFLAGS into eax
			mov ebx,eax // keep a copy
			xor eax,0x200000 // toggle CPUID bit
			push eax
			popfd // set new EFLAGS
			pushfd
			pop eax // EFLAGS back into eax


			// have we changed the ID bit?
			xor eax,ebx 

			je NO_SERIAL_NUM

			// we could toggle the bit so CPUID
			// is present
			mov eax,1

			cpuid // get processor features

			// check the serial number bit
			test edx,1<<18

			jz NO_SERIAL_NUM
			mov found_sn,1
			jmp DONE
			NO_SERIAL_NUM:
			mov found_sn,0
			DONE:
		} 
	}
    __except( EXCEPTION_EXECUTE_HANDLER )
    {
        bException = TRUE;
		return FALSE;
    }

	if (found_sn == FALSE){
		return FALSE;
	}

//get CPUID
	DWORD b,m,t;
    __try
    {
		_asm
		{
			mov eax,1
			cpuid

			// top 32 bits are the processor
			// signature bits
			mov t,eax

			// A new CPUID code for the
			// Pentium III
			mov eax,3


			cpuid
			mov m,edx
			mov b,ecx

		}

		// copy the locals into the pointer variables passed in
    }
    __except( EXCEPTION_EXECUTE_HANDLER )
    {
        bException = TRUE;
		return FALSE;
    }
	sprintf_s(lpszCPUID,length,"%x%x%x",t,m,b);

}

BOOL DoIdentify( HANDLE hPhysicalDriveIOCTL, PSENDCMDINPARAMS pSCIP,
                 PSENDCMDOUTPARAMS pSCOP, BYTE bIDCmd, BYTE bDriveNum,
                 PDWORD lpcbBytesReturned )
{
    // Set up data structures for IDENTIFY command.
    pSCIP->cBufferSize                  = IDENTIFY_BUFFER_SIZE;
    pSCIP->irDriveRegs.bFeaturesReg     = 0;
    pSCIP->irDriveRegs.bSectorCountReg  = 1;
    pSCIP->irDriveRegs.bSectorNumberReg = 1;
    pSCIP->irDriveRegs.bCylLowReg       = 0;
    pSCIP->irDriveRegs.bCylHighReg      = 0;
    
    // calc the drive number.
    pSCIP->irDriveRegs.bDriveHeadReg = 0xA0 | ( ( bDriveNum & 1 ) << 4 );

    // The command can either be IDE identify or ATAPI identify.
    pSCIP->irDriveRegs.bCommandReg = bIDCmd;
    pSCIP->bDriveNumber = bDriveNum;
    pSCIP->cBufferSize = IDENTIFY_BUFFER_SIZE;
    
    return DeviceIoControl( hPhysicalDriveIOCTL, DFP_RECEIVE_DRIVE_DATA,
        ( LPVOID ) pSCIP,
        sizeof( SENDCMDINPARAMS ) - 1,
        ( LPVOID ) pSCOP,
        sizeof( SENDCMDOUTPARAMS ) + IDENTIFY_BUFFER_SIZE - 1,
        lpcbBytesReturned, NULL );
}


BOOL WinNTHDSerialNumAsScsiRead( BYTE* dwSerial, UINT* puSerialLen, UINT uMaxSerialLen )
{
    BOOL bInfoLoaded = FALSE;
    
    for( int iController = 0; iController < 2; ++ iController )
    {
        HANDLE hScsiDriveIOCTL = 0;
        wchar_t   szDriveName[256];
        
        //  Try to get a handle to PhysicalDrive IOCTL, report failure
        //  and exit if can't.
        swprintf( szDriveName,256,L"\\\\.\\Scsi%d:", iController );

        //  Windows NT, Windows 2000, any rights should do
        hScsiDriveIOCTL = CreateFile( szDriveName,
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
            OPEN_EXISTING, 0, NULL);

        // if (hScsiDriveIOCTL == INVALID_HANDLE_VALUE)
        //    printf ("Unable to open SCSI controller %d, error code: 0x%lX\n",
        //            controller, GetLastError ());
        
        if( hScsiDriveIOCTL != INVALID_HANDLE_VALUE )
        {
            int iDrive = 0;
            for( iDrive = 0; iDrive < 2; ++ iDrive )
            {
                char szBuffer[sizeof( SRB_IO_CONTROL ) + SENDIDLENGTH] = { 0 };

                SRB_IO_CONTROL* p = ( SRB_IO_CONTROL* )szBuffer;
                SENDCMDINPARAMS* pin = ( SENDCMDINPARAMS* )( szBuffer + sizeof( SRB_IO_CONTROL ) );
                DWORD dwResult;

                p->HeaderLength = sizeof( SRB_IO_CONTROL );
                p->Timeout = 10000;
                p->Length = SENDIDLENGTH;
                p->ControlCode = IOCTL_SCSI_MINIPORT_IDENTIFY;
                strncpy( ( char* )p->Signature, "SCSIDISK", 8 );

                pin->irDriveRegs.bCommandReg = IDE_ATA_IDENTIFY;
                pin->bDriveNumber = iDrive;
                
                if( DeviceIoControl( hScsiDriveIOCTL, IOCTL_SCSI_MINIPORT,
                    szBuffer,
                    sizeof( SRB_IO_CONTROL ) + sizeof( SENDCMDINPARAMS ) - 1,
                    szBuffer,
                    sizeof( SRB_IO_CONTROL ) + SENDIDLENGTH,
                    &dwResult, NULL ) )
                {
                    SENDCMDOUTPARAMS* pOut = ( SENDCMDOUTPARAMS* )( szBuffer + sizeof( SRB_IO_CONTROL ) );
                    IDSECTOR* pId = ( IDSECTOR* )( pOut->bBuffer );
                    if( pId->sModelNumber[0] )
                    {
                        if( * puSerialLen + 60U <= uMaxSerialLen )
                        {
                            // 序列号
                            CopyMemory( dwSerial + * puSerialLen, ( ( USHORT* )pId ) + 10, 20 );

                            // Cut off the trailing blanks
							UINT i;
                            for( i = 20; i != 0U && ' ' == dwSerial[* puSerialLen + i - 1]; -- i )
                            {}
                            * puSerialLen += i;

                            // 型号
                            CopyMemory( dwSerial + * puSerialLen, ( ( USHORT* )pId ) + 27, 40 );
                            // Cut off the trailing blanks
                            for( i = 40; i != 0U && ' ' == dwSerial[* puSerialLen + i - 1]; -- i )
                            {}
                            * puSerialLen += i;
							dwSerial[*puSerialLen] = '\0';

                            bInfoLoaded = TRUE;
                        }
                        else
                        {
                            ::CloseHandle( hScsiDriveIOCTL );
                            return bInfoLoaded;
                        }
                    }
                }
            }
            ::CloseHandle( hScsiDriveIOCTL );
        }
    }
    return bInfoLoaded;
}

	//  function to decode the serial numbers of IDE hard drives
	//  using the IOCTL_STORAGE_QUERY_PROPERTY command 
char * flipAndCodeBytes (const char * str,
			 int pos,
			 int flip,
			 char * buf)
{
   int i;
   int j = 0;
   int k = 0;

   buf [0] = '\0';
   if (pos <= 0)
      return buf;

   if ( ! j)
   {
      char p = 0;

      // First try to gather all characters representing hex digits only.
      j = 1;
      k = 0;
      buf[k] = 0;
      for (i = pos; j && str[i] != '\0'; ++i)
      {
	 char c = tolower(str[i]);

	 if (isspace(c))
	    c = '0';

	 ++p;
	 buf[k] <<= 4;

	 if (c >= '0' && c <= '9')
	    buf[k] |= (unsigned char) (c - '0');
	 else if (c >= 'a' && c <= 'f')
	    buf[k] |= (unsigned char) (c - 'a' + 10);
	 else
	 {
	    j = 0;
	    break;
	 }

	 if (p == 2)
	 {
	    if (buf[k] != '\0' && ! isprint(buf[k]))
	    {
	       j = 0;
	       break;
	    }
	    ++k;
	    p = 0;
	    buf[k] = 0;
	 }

      }
   }

   if ( ! j)
   {
      // There are non-digit characters, gather them as is.
      j = 1;
      k = 0;
      for (i = pos; j && str[i] != '\0'; ++i)
      {
	     char c = str[i];

	     if ( ! isprint(c))
	     {
	        j = 0;
	        break;
	     }

	     buf[k++] = c;
      }
   }

   if ( ! j)
   {
      // The characters are not there or are not printable.
      k = 0;
   }

   buf[k] = '\0';

   if (flip)
      // Flip adjacent characters
      for (j = 0; j < k; j += 2)
      {
	     char t = buf[j];
	     buf[j] = buf[j + 1];
	     buf[j + 1] = t;
      }

   // Trim any beginning and end space
   i = j = -1;
   for (k = 0; buf[k] != '\0'; ++k)
   {
      if (! isspace(buf[k]))
      {
	     if (i < 0)
	        i = k;
	     j = k;
      }
   }

   if ((i >= 0) && (j >= 0))
   {
      for (k = i; (k <= j) && (buf[k] != '\0'); ++k)
         buf[k - i] = buf[k];
      buf[k - i] = '\0';
   }

   return buf;
}


BOOL ReadPhysicalDriveInNTWithZeroRights ( BYTE* dwSerial, UINT* puSerialLen, UINT uMaxSerialLen)
{
   int done = FALSE;
   int drive = 0;

   for (drive = 0; drive < MAX_IDE_DRIVES; drive++)
   {
      HANDLE hPhysicalDriveIOCTL = 0;

         //  Try to get a handle to PhysicalDrive IOCTL, report failure
         //  and exit if can't.
      wchar_t driveName [256];

      swprintf (driveName, 256, L"\\\\.\\PhysicalDrive%d", drive);

         //  Windows NT, Windows 2000, Windows XP - admin rights not required
      hPhysicalDriveIOCTL = CreateFile (driveName, 0,
                               FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                               OPEN_EXISTING, 0, NULL);
      if (hPhysicalDriveIOCTL == INVALID_HANDLE_VALUE)
      {

      }
      else
      {
		 STORAGE_PROPERTY_QUERY query;
         DWORD cbBytesReturned = 0;
		 char buffer [10000];

         memset ((void *) & query, 0, sizeof (query));
		 query.PropertyId = StorageDeviceProperty;
		 query.QueryType = PropertyStandardQuery;

		 memset (buffer, 0, sizeof (buffer));

         if ( DeviceIoControl (hPhysicalDriveIOCTL, IOCTL_STORAGE_QUERY_PROPERTY,
                   & query,
                   sizeof (query),
				   & buffer,
				   sizeof (buffer),
                   & cbBytesReturned, NULL) )
         {         
			 STORAGE_DEVICE_DESCRIPTOR * descrip = (STORAGE_DEVICE_DESCRIPTOR *) & buffer;
			 char serialNumber [1000];
			 char modelNumber [1000];
             char vendorId [1000];
	         char productRevision [1000];

             flipAndCodeBytes (buffer,
                               descrip -> VendorIdOffset,
			                   0, vendorId );
	         flipAndCodeBytes (buffer,
			                   descrip -> ProductIdOffset,
			                   0, modelNumber );
	         flipAndCodeBytes (buffer,
			                   descrip -> ProductRevisionOffset,
			                   0, productRevision );
	         flipAndCodeBytes (buffer,
			                   descrip -> SerialNumberOffset,
			                   1, serialNumber );

			 if (//  serial number must be alphanumeric but there can be leading spaces on IBM drives
				   ((serialNumber[0] != 0 && isalnum (serialNumber [0])) || isalnum (serialNumber [19])))
			 {
// to be changed
				 if (* puSerialLen + strlen(serialNumber) + strlen(modelNumber) < uMaxSerialLen){
					 strncpy_s ((char *)dwSerial + * puSerialLen,uMaxSerialLen - * puSerialLen, serialNumber,uMaxSerialLen - * puSerialLen - 1);
					 * puSerialLen += (UINT)strlen(serialNumber);
					 strncpy_s ((char *)dwSerial + * puSerialLen,uMaxSerialLen - * puSerialLen, modelNumber,uMaxSerialLen - * puSerialLen - 1);
					 * puSerialLen += (UINT)strlen(modelNumber);
					 done = TRUE;
				 }
			 }
         }
		 else
		 {
			 DWORD err = GetLastError ();
		 }

         CloseHandle (hPhysicalDriveIOCTL);
      }
   }

   return done;
}

BOOL WinNTHDSerialNumAsPhysicalRead( BYTE* dwSerial, UINT* puSerialLen, UINT uMaxSerialLen )
{
#define  DFP_GET_VERSION          0x00074080
    BOOL bInfoLoaded = FALSE;

    for( UINT uDrive = 0; uDrive < 4; ++ uDrive )
    {
        HANDLE hPhysicalDriveIOCTL = 0;

        //  Try to get a handle to PhysicalDrive IOCTL, report failure
        //  and exit if can't.
        wchar_t szDriveName [256];
        swprintf( szDriveName,256, L"\\\\.\\PhysicalDrive%d", uDrive );

        //  Windows NT, Windows 2000, must have admin rights
        hPhysicalDriveIOCTL = CreateFile( szDriveName,
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
            OPEN_EXISTING, 0, NULL);

        if( hPhysicalDriveIOCTL != INVALID_HANDLE_VALUE )
        {
            GETVERSIONOUTPARAMS VersionParams = { 0 };
            DWORD               cbBytesReturned = 0;

            // Get the version, etc of PhysicalDrive IOCTL
            if( DeviceIoControl( hPhysicalDriveIOCTL, DFP_GET_VERSION,
                NULL,
                0,
                &VersionParams,
                sizeof( GETVERSIONOUTPARAMS ),
                &cbBytesReturned, NULL ) )
            {
                // If there is a IDE device at number "i" issue commands
                // to the device
                if( VersionParams.bIDEDeviceMap != 0 )
                {
                    BYTE             bIDCmd = 0;   // IDE or ATAPI IDENTIFY cmd
                    SENDCMDINPARAMS  scip = { 0 };

                    // Now, get the ID sector for all IDE devices in the system.
                    // If the device is ATAPI use the IDE_ATAPI_IDENTIFY command,
                    // otherwise use the IDE_ATA_IDENTIFY command
                    bIDCmd = ( VersionParams.bIDEDeviceMap >> uDrive & 0x10 ) ? IDE_ATAPI_IDENTIFY : IDE_ATA_IDENTIFY;
                    BYTE IdOutCmd[sizeof( SENDCMDOUTPARAMS ) + IDENTIFY_BUFFER_SIZE - 1] = { 0 };

                    if( DoIdentify( hPhysicalDriveIOCTL,
                        &scip,
                        ( PSENDCMDOUTPARAMS )&IdOutCmd,
                        ( BYTE )bIDCmd,
                        ( BYTE )uDrive,
                        &cbBytesReturned ) )
                    {
                        if( * puSerialLen + 60U <= uMaxSerialLen )
                        {
                            CopyMemory( dwSerial + * puSerialLen, ( ( USHORT* )( ( ( PSENDCMDOUTPARAMS )IdOutCmd )->bBuffer ) ) + 10, 20 );  // 序列号

                            // Cut off the trailing blanks
							UINT i;
                            for( i = 20; i != 0U && ' ' == dwSerial[* puSerialLen + i - 1]; -- i )  {}
                            * puSerialLen += i;

                            CopyMemory( dwSerial + * puSerialLen, ( ( USHORT* )( ( ( PSENDCMDOUTPARAMS )IdOutCmd )->bBuffer ) ) + 27, 40 ); // 型号

                            // Cut off the trailing blanks
                            for( i = 40; i != 0U && ' ' == dwSerial[* puSerialLen + i - 1]; -- i )  {}
                            * puSerialLen += i;
							dwSerial[*puSerialLen] = '\0';
                            bInfoLoaded = TRUE;
                        }
                        else
                        {
                            ::CloseHandle( hPhysicalDriveIOCTL );
                            return bInfoLoaded;
                        }
                    }
                }
            }
            CloseHandle( hPhysicalDriveIOCTL );
        }
    }
    return bInfoLoaded;
}

BOOL CUidGenerator::getHDSN(char *lpszHDSN, int length){
	if (length <= 60) return false;
	memset(lpszHDSN,0x00,length);
	OSVERSIONINFO ovi = { 0 };
	ovi.dwOSVersionInfoSize = sizeof( OSVERSIONINFO );
	GetVersionEx( &ovi );
	UINT pos = 0;
	if( ovi.dwPlatformId != VER_PLATFORM_WIN32_NT )
    {
        // Only Windows 2000, Windows XP, Windows Server 2003...
        return FALSE;
    }
    else
    {
        if( !WinNTHDSerialNumAsPhysicalRead( (BYTE *)lpszHDSN, &pos, 1023 ) )
        {
			if (!WinNTHDSerialNumAsScsiRead( (BYTE *)lpszHDSN, &pos, 1023 ) ) {
				ReadPhysicalDriveInNTWithZeroRights((BYTE *)lpszHDSN, &pos, 1023);
			}
        }
    }
	return TRUE;
}


/* AString getID (); */
NS_IMETHODIMP CUidGenerator::GetID(nsAString & _retval)
{
	char lpszCPUHD[1024];
	char lpszMac[256];
	md5wrapper * md5 = new md5wrapper();
	string md5_1;
	string md5_2;
	string id;
	char random1[5];
	random1[0] = 'y'; random1[1] = 'a'; random1[2] = 'n'; random1[3] = 'k'; random1[4] = '\0';
	if ((!getHDSN(lpszCPUHD,1023)) && (!getCPUID(lpszCPUHD,1023))){
		md5_1 = md5->getHashFromString("");
	} else {
		md5_1 = md5->getHashFromString(lpszCPUHD);
	}
	if (!getMacAddress(lpszMac,255)){
		md5_2 = md5->getHashFromString("");
	} else {
		md5_2 = md5->getHashFromString(lpszMac);
	}
	id = "key1=";
	id += md5_1 + "&key2=" + md5_2+"&random1=" + random1;

	string ret = md5->getHashFromString(id);
	wchar_t w_ret[1024];
	MultiByteToWideChar(CP_UTF8,0,ret.c_str(),ret.length() + 1, w_ret,1023);
	_retval = w_ret;
	delete md5;
	return NS_OK;
}

/* AString getActivationKey (); */
//NS_IMETHODIMP CUidGenerator::GetActivationKey(const PRUnichar *sn, nsAString & _retval)
NS_IMETHODIMP CUidGenerator::GetActivationKey(nsAString & _retval)
{
	SYSTEMTIME time;
	GetSystemTime(&time);
	char lpszTime[256];
	sprintf_s(lpszTime,255,"%u:%u:%u:%u_%u_%u_%u",time.wHour,time.wMinute,time.wSecond,time.wMilliseconds,time.wYear,time.wMonth,time.wDay);
	char lpszCPUHD[1024];
	char lpszMac[256];
	md5wrapper * md5 = new md5wrapper();
	string md5_1;
//	string md5_2;
	string actCode;
	wchar_t w_ret[1024];
//	char lpszSN[1024];
//	WideCharToMultiByte(CP_UTF8,0,sn,wcslen(sn)+1,lpszSN,1023,NULL,NULL);
	char * random2 = "mozilla";
	if ((!getHDSN(lpszCPUHD,1023)) && (!getCPUID(lpszCPUHD,1023))){
		md5_1 = md5->getHashFromString("");
	} else {
		md5_1 = md5->getHashFromString(lpszCPUHD);
	}
/*	if (!getMacAddress(lpszMac,255)){
		md5_2 = md5->getHashFromString("");
	} else {
		md5_2 = md5->getHashFromString(lpszMac);
	}*/
	actCode = "time=";
	actCode += lpszTime;
	actCode += "&key1=";
//	actCode += md5_1 + "&key2=" + md5_2+"&sn="+ lpszSN + "&random2=" + random2;
	actCode += md5_1 + "&random2=" + random2;
	Encrypt enc;
	char key[25];
	key[0] = '8';key[1] = '7';key[2] = '6';key[3] = '5';
	key[4] = '4';key[5] = '3';key[6] = '2';key[7] = '1';
	key[8] = 'm';key[9] = 'o';key[10] = 'z';key[11] = 'i';
	key[12] = 'l';key[13] = 'l';key[14] = 'a';key[15] = 'i';
	key[16] = 's';key[17] = 's';key[18] = 'e';key[19] = 'v';
	key[20] = 'e';key[21] = 'n';key[22] = 'c';key[23] = 'h';key[24] = '\0';
	unsigned char iv[9];
	iv[0] = 'l';iv[1] = 'a'; iv[2] = 'l'; iv[3] = 'a'; iv[4] = 's'; iv[5] = 'h'; iv[6] = 'i'; iv[7] = 't'; iv[8] = '\0';
	char * temp = enc.encrypt((unsigned char*)key, iv, actCode.c_str(), actCode.length());
	MultiByteToWideChar(CP_UTF8,0,temp,strlen(temp)+1,w_ret,1023);
	_retval = w_ret;
	delete md5;
    return NS_OK;
}

NS_IMETHODIMP CUidGenerator::GetCommonAppdataFolder(nsAString & _retval){
   TCHAR szPath[MAX_PATH];
   // Get path for each computer, non-user specific and non-roaming data.
   if ( SUCCEEDED( SHGetFolderPath( NULL, CSIDL_COMMON_APPDATA, 
                                    NULL, 0, szPath ) ) )
   {
	   _retval = szPath;
   }else{
	   _retval = L"";
   }
	return NS_OK;
}