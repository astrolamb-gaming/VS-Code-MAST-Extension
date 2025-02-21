
import sys
import traceback
from inspect import signature

sys.modules['script'] = sys.modules.get('__main__')
sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2]
print(sbs_utilsPath)

def getGlobals(globals):
	count = 0
	for k in globals:
			test = globals[k]
			if callable(test):
				count += 1
				try:
					print(k)
					#print(signature(test))
					#print(test.__doc__)
				except:
					pass
				#m = test.__module__
				#print(f"{k} from {m}")
	print("Count: " + str(count))

try:
	sys.path.append(sbsPath)
	sys.path.append(sbs_utilsPath)
	print(sbs_utilsPath)
	try:
		from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
		#from sbs_utils.mast.mast import Mast # type: ignore
		getGlobals(Mast.globals)
	except:

		# Works
		from sbs_utils.mast.mast_node import MastNode, mast_node, IF_EXP_REGEX
		from sbs_utils.mast.mast import Mast
		from sbs_utils.mast import core_nodes
		from sbs_utils.mast_sbs import story_nodes
		from sbs_utils.mast_sbs.mast_sbs_procedural import * # type: ignore
		# # type: ignore
		
		getGlobals(MastGlobals.globals)
except Exception as e:
	exc_type, exc_value, exc_tb = sys.exc_info()
	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
	print(stack_trace)