#!/usr/bin/env python
import math
import sys
import traceback
import inspect
import numbers
import json

def parseFunction(module,f):
	print(callable(math.cos))
	func = eval(module + "." + f)
	print(func)
	if not callable(func):
		print("not callable")
		return 0
	print(inspect.getdoc(func))
	print(inspect.signature(func))


def parseModule(module):
	mod = module
	print(mod)
	if not "module" in str(module):
		module = eval(module)
		if not "module" in str(module):
			return 0
	# DO stuff

	members = inspect.getmembers(module)
	for m in members:
		# print(m)
		print(mod + "." + m[0])
		parseFunction(mod, m[0])


sys.modules['script'] = sys.modules.get('__main__')
sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2]
token = None
try: 
	# print(sys.argv[3])
	if sys.argv[3]:
		token = sys.argv[3]
except:
	pass

if token is None:
	print("Token is none")
	import sys
	sys.exit()


sys.path.append(sbsPath)
sys.path.append(sbs_utilsPath)
# print(sbs_utilsPath)
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
		# print(token)
		# module = eval(token)
		# inspect.signature(eval(token))
		# members = inspect.getmembers(module)
		
		# parseModule(token)
		# print(MastGlobals.globals)
		globalsList = json.loads(token)
		for g in MastGlobals.globals:
			# print(str(g))
			for t in globalsList:
				if str(g) == t:
					print(g)
					mod = eval(g)
					sig = inspect.signature(mod)
					
					members = inspect.getmembers(module)
					if sig is not None:
						print(sig)

		# 
		# for t in globalsList:
		# 	g = eval(t)
		# 	print(g)

		# print(token)
		
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		print(stack_trace)
