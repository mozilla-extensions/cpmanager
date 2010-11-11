#include "nsIGenericFactory.h"
#include "comp-impl.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(CUidGenerator)

static nsModuleComponentInfo components[] =
{
    {
       UIDGENERATOR_CLASSNAME, 
       UIDGENERATOR_CID,
       UIDGENERATOR_CONTRACTID,
       CUidGeneratorConstructor,
    }
};

NS_IMPL_NSGETMODULE("UidGeneratorModule", components) 

