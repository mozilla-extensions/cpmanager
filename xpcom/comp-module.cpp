#include "mozilla/ModuleUtils.h"
#include "comp-impl.h"

// copy from mozilla/xpcom/sample/nsSampleModule.cpp
NS_GENERIC_FACTORY_CONSTRUCTOR(CUidGenerator)
	NS_DEFINE_NAMED_CID(UIDGENERATOR_CID);
static const mozilla::Module::CIDEntry kUIDGENERATORCIDs[] = {
	{ &kUIDGENERATOR_CID, false, NULL,CUidGeneratorConstructor  },
	{ NULL } 
};

static const mozilla::Module::ContractIDEntry kUIDGENERATORContracts[] = {
	{ UIDGENERATOR_CONTRACTID, &kUIDGENERATOR_CID },
	{ NULL }
};


static const mozilla::Module::CategoryEntry kUIDGENERATORCategories[] = {
	{ "my-category", "my-key", UIDGENERATOR_CONTRACTID },
	{ NULL }
};

static const mozilla::Module kUIDGENERATORModule = {
	mozilla::Module::kVersion,
	kUIDGENERATORCIDs,
	kUIDGENERATORContracts,
	kUIDGENERATORCategories
};

/*static nsModuleComponentInfo components[] =
{
	{
		UIDGENERATOR_CLASSNAME, 
			UIDGENERATOR_CID,
			UIDGENERATOR_CONTRACTID,
			CUidGeneratorConstructor,
	}
};*/

//NS_IMPL_NSGETMODULE("UidGeneratorModule", components) 
NSMODULE_DEFN(UIDGENERATORModule) = &kUIDGENERATORModule;
NS_IMPL_MOZILLA192_NSGETMODULE(&kUIDGENERATORModule)

