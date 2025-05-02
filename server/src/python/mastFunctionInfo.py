#!/usr/bin/env python
import math
import sys
import traceback
import inspect
import numbers

# print(inspect.signature(math.cos))
# print(inspect.signature(eval('math.cos')))

sys.modules['script'] = sys.modules.get('__main__')
sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2]
try: 
	if sys.argv[3]:
		pass
except:
	pass
# print(sbs_utilsPath)

# for testing:
# sbs_utilsPath = "D:\\Cosmos Dev\\Cosmos-1-0-1\\data\missions\\__lib__\\artemis-sbs.sbs_utils.v1.0.2.01.sbslib"
# sbsPath = "C:\\Users\\matts\\.vscode\\extensions\\mast\\server\\src\\sbs.zip"
callables = []
modules = []



# try:
sys.path.append(sbsPath)
sys.path.append(sbs_utilsPath)
print(sbs_utilsPath)
loaded = False
try:
	# Only purpose of this try statement is if the user is using an older version of sbs_utils.
	from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
	#from sbs_utils.mast.mast import Mast # type: ignore
	# print(globals())
	# getGlobals(Mast.globals)
	loaded = True
except:
	exc_type, exc_value, exc_tb = sys.exc_info()
	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
	# print(stack_trace)
if not loaded:
	try:
		# Works
		from sbs_utils.mast.mast_node import MastNode, mast_node, IF_EXP_REGEX
		from sbs_utils.mast.mast import Mast
		from sbs_utils.mast import core_nodes
		from sbs_utils.mast_sbs import story_nodes
		from sbs_utils.mast_sbs.mast_sbs_procedural import * # type: ignore
		# # type: ignore
		# g = globals()
		# for k in g:
		# 	print(f"{k[0]}\n{k[1]}")
		
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		print(stack_trace)



content = sys.stdin.read().replace("\r","")
