#!/usr/bin/env python
import math
import sys
import traceback
import inspect
import numbers
import json




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


		
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		print(stack_trace)
else:
	sys.exit(0)

# Need to 
# I don't know what I was going to write in the line above...
import json
import random
import itertools
# Testing
# print(inspect.signature(math.cos))
# print(inspect.signature(math.hypot)) # not found
# print(str(inspect.getfullargspec(math.hypot))) # unsupported callable
# print(inspect.getdoc(math.e))
# import sys
# print(sys.version)
def is_number(value):
    try:
        float(value)
        return True
    except ValueError:
        return False

class Info:
	"""
	We're going to treat everything as a function for simplicity's sake on the python end.
	So if we're using math.cos(), the function will be math.cos(), we'll ignore the fact that its part of a module for now.
	"""
	mastName = ""
	pyName = ""
	kind = ""
	documentation = ""
	arguments = ""
	module = ""
	argspec = ""
	_help = ""
	code = ""
	sig = ""
	value = ""


	def __init__(self, mastName, pyName):
		self.mastName = mastName
		self.pyName = pyName

class Param:
	name = ""
	annotation = ""
	default = ""
	kind = ""

def parseFunction(mastName: str, module:str , pyName) -> Info:
	"""
	parses function info and returns and Info object
	"""
	if module != "":
		pyName = module + "." + pyName
		# mastName = pyName
	# print(pyName)
	func = eval(pyName)
	# print(func)
	
	
	info = Info(mastName, pyName)
	info.module = module

	# Get documentation
	try:
		info.documentation = inspect.getdoc(func)
	except:
		try:
			info.documentation = func.__doc__
		except:
			pass
	# If it's not a function, don't continue
	if not callable(func):
		return info
	info.kind = "function"

	# Get arguments
	try:
		info.argspec = str(inspect.getfullargspec(func).args)
	except:
		pass

	# Get signature info. This might be unnecessary because argspec does this better imo
	try:
		sigs = inspect.signature(func)
		if sigs:
			info.sig = str(sigs)
	except:
		# exc_type, exc_value, exc_tb = sys.exc_info()
		# stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		# print(stack_trace)
		pass

	return info


def parseClass(mastName,module,pyName):
	if inpsect.isclass(mastName):
		try:
			sig = inpsect.signature(mastName)
			print(sig)
		except:
			pass
		try:
			members = inspect.getmembers(mastName)
		except:
			pass



globalsList = json.loads(token)
# print(globalsList)
globals = MastGlobals.globals

globals["dict"] = dict

standardTypes = ["str",'int','list','set','range','dict']
ret = []
for g in globals:
	# Turns out globalsList is not needed and could cause some issues here; i.e. if a mast global exists but isn't listed in globalsList (like `dict`)
	# for t in globalsList:
	# 	if str(g) == t[0]:
			# This is the name of the global for MAST
			# print(g)

			# print(globals[g])

			if "module" in str(globals[g]) or "class" in str(globals[g]):
				info = Info(g,g)
				info.kind = "module"
				try:
					info.documentation = inspect.getdoc(globals[g])
				except:
					pass
				print(json.dumps(info.__dict__))
				# print("Module: " + g)
				# parseFunction(t[0], "", globals[g])
				try:
					members = inspect.getmembers(globals[g])
					if members:
						for m in members:
							if m[0].startswith("_"):
								continue
							name = g + "." + m[0]

							info = parseFunction(m[0],g,m[0]) #Is an Info object
							if info.documentation is None:
								info.documentation = ""

							if g in standardTypes:
								info.documentation += f"\nMore information can probably be found at https://docs.python.org/3/library/stdtypes.html#{name}"
							else:
								info.documentation += f"\nMore information can probably be found at https://docs.python.org/3/library/{g}.html#{name}"
							if "module" in str(globals[g]):
								info.kind = "module"
								

							elif "class" in str(globals[g]):
								info.kind = "class"

							if is_number(str(m[1])) or str(m[1]) == "Infinity":
								info.value = str(m[1])
								info.kind += " constant"
								# print("Constant: ")
								# print(info.__dict__)
							else:
								info.kind += " function"

							#### UNCOMMENT
							print(json.dumps(info.__dict__))
							


				except:
					exc_type, exc_value, exc_tb = sys.exc_info()
					stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
					print(stack_trace)
