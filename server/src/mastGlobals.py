
import sys
import traceback
import inspect
import numbers


sys.modules['script'] = sys.modules.get('__main__')
sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2]
print(sbs_utilsPath)

# for testing:
# sbs_utilsPath = "D:\\Cosmos Dev\\Cosmos-1-0-1\\data\missions\\__lib__\\artemis-sbs.sbs_utils.v1.0.2.01.sbslib"
# sbsPath = "C:\\Users\\matts\\.vscode\\extensions\\mast\\server\\src\\sbs.zip"
callables = []
modules = []

def compare():
	global callables
	global modules
	for c in callables:
		for m in modules:
			if c in inspect.getmembers(m,inspect.isfunction):
				print("Has the same")

def getGlobals(globals):
	count = 0
	for k in globals:
		try:
			# print(globals[k])
			# print(test)
			if callable(globals[k]):
				callables.append(k)
				print("Callable")
				count += 1
				continue
				# try:
				# 	print("Callable")
				# 	print(k)
					
				# 	#print(signature(test))
				# 	#print(test.__doc__)
				# except:
				# 	exc_type, exc_value, exc_tb = sys.exc_info()
				# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
				# 	print(stack_trace)
				# 	continue

			if ("module" in str(globals[k])):
				modules.append(globals[k])
				if str(globals[k]) == "script":
					# Don't do anything, this is THIS script, we don't want this stuff contaminating the results
					# But there are functions here that aren't in this script.... layout_list_box_control and others
					# Might need to specifically exclude the functions in this file.
					continue
				print("Module " + k)
				funcs = inspect.getmembers(globals[k],inspect.isfunction)
				print(funcs)
				continue
			if str(globals[k]).isnumeric():
				print("Number")
				continue
			else:
				print("OTHERS")
				print(k)
				print(globals[k])

			#m = test.__module__
			#print(f"{k} from {m}")
		except Exception as e:
				exc_type, exc_value, exc_tb = sys.exc_info()
				stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
				print(stack_trace)
				continue
	print("Count: " + str(count))

# try:
sys.path.append(sbsPath)
sys.path.append(sbs_utilsPath)
print(sbs_utilsPath)
loaded = False
try:
	from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
	#from sbs_utils.mast.mast import Mast # type: ignore
	getGlobals(Mast.globals)
	loaded = True
except:
	exc_type, exc_value, exc_tb = sys.exc_info()
	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
	print(stack_trace)
if not loaded:
	try:
		# Works
		from sbs_utils.mast.mast_node import MastNode, mast_node, IF_EXP_REGEX
		from sbs_utils.mast.mast import Mast
		from sbs_utils.mast import core_nodes
		from sbs_utils.mast_sbs import story_nodes
		from sbs_utils.mast_sbs.mast_sbs_procedural import * # type: ignore
		# # type: ignore
		
		getGlobals(MastGlobals.globals)
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		print(stack_trace)

compare()
# except Exception as e:
# 	exc_type, exc_value, exc_tb = sys.exc_info()
# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 	print(stack_trace)