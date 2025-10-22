# #!/usr/bin/env python
# import math
# import sys
# import traceback
# import inspect
# import numbers

# # print(inspect.signature(math.cos))
# # print(inspect.signature(eval('math.cos')))

# def parseFunction(module,f):
# 	print(callable(math.cos))
# 	func = eval(module + "." + f)
# 	print(func)
# 	if not callable(func):
# 		print("not callable")
# 		return 0
# 	print(inspect.getdoc(func))
# 	print(inspect.signature(func))


# def parseModule(module):
# 	mod = module
# 	print(mod)
# 	if not "module" in str(module):
# 		module = eval(module)
# 		if not "module" in str(module):
# 			return 0
# 	# DO stuff

# 	members = inspect.getmembers(module)
# 	for m in members:
# 		# print(m)
# 		print(mod + "." + m[0])
# 		parseFunction(mod, m[0])

# sys.modules['script'] = sys.modules.get('__main__')
# sbs_utilsPath = sys.argv[1] # Very important
# sbsPath = sys.argv[2]
# token = None
# try: 
# 	# print(sys.argv[3])
# 	if sys.argv[3]:
# 		token = sys.argv[3]
# except:
# 	pass

# if token is None:
# 	print("Token is none")
# 	import sys
# 	sys.exit()
# # print(sbs_utilsPath)

# # for testing:
# # sbs_utilsPath = "D:\\Cosmos Dev\\Cosmos-1-0-1\\data\missions\\__lib__\\artemis-sbs.sbs_utils.v1.0.2.01.sbslib"
# # sbsPath = "C:\\Users\\matts\\.vscode\\extensions\\mast\\server\\src\\sbs.zip"
# callables = []
# modules = []



# # try:
# sys.path.append(sbsPath)
# sys.path.append(sbs_utilsPath)
# # print(sbs_utilsPath)
# loaded = False
# try:
# 	# Only purpose of this try statement is if the user is using an older version of sbs_utils.
# 	from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
# 	#from sbs_utils.mast.mast import Mast # type: ignore
# 	# print(globals())
# 	# getGlobals(Mast.globals)
# 	loaded = True
# except:
# 	exc_type, exc_value, exc_tb = sys.exc_info()
# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 	# print(stack_trace)
# if not loaded:
# 	try:
# 		# Works
# 		from sbs_utils.mast.mast_node import MastNode, mast_node, IF_EXP_REGEX
# 		from sbs_utils.mast.mast import Mast
# 		from sbs_utils.mast import core_nodes
# 		from sbs_utils.mast_sbs import story_nodes
# 		from sbs_utils.mast_sbs.mast_sbs_procedural import * # type: ignore
# 		# # type: ignore
# 		# g = globals()
# 		# for k in g:
# 		# 	print(f"{k[0]}\n{k[1]}")
# 		print(token)
# 		module = eval(token)
# 		# inspect.signature(eval(token))
# 		# members = inspect.getmembers(module)
		
# 		parseModule(token)
		
# 	except:
# 		exc_type, exc_value, exc_tb = sys.exc_info()
# 		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 		print(stack_trace)



# # content = sys.stdin.read().replace("\r","")
