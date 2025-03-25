
import math
import sys
import traceback
import inspect
import numbers

print(inspect.signature(math.cos))
print(inspect.signature(eval('math.cos')))

sys.modules['script'] = sys.modules.get('__main__')
sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2]
print(sbs_utilsPath)

# for testing:
# sbs_utilsPath = "D:\\Cosmos Dev\\Cosmos-1-0-1\\data\missions\\__lib__\\artemis-sbs.sbs_utils.v1.0.2.01.sbslib"
# sbsPath = "C:\\Users\\matts\\.vscode\\extensions\\mast\\server\\src\\sbs.zip"
callables = []
modules = []

class FunctionObj:
	module = ""
	name = ""
	parameters = ""
	docString = ""
	
	def __init__(self, fname):
		self.name = fname
	def setModule(self, mod):
		self.module = mod
	def addParameters(self, params):
		# self.parameters.append(params)
		self.parameters = params
	def setDocString(self,doc):
		self.docString = doc
	def toString(self):
		return "{'name': " + f"'{self.name}'" + ", 'module': " + f"'{self.module}'" + ", 'parameters': " + f"\"{self.paramsToString()}\"" + ", 'docs': " + f"\"{self.docString}\"" + "}"
	def paramsToString(self):
		return self.parameters
		ret = "["
		for p in self.parameters:
			if p == "[":
				ret = ret + f"{p}"
			else:
				ret = ret + f",{p}"
		ret = ret + "]"
		return ret
class Constant:
	name = ""
	module = ""
	value = ""
	docs = ""
	def __init__(self, cname):
		self.name = cname
	def setModule(self, mod):
		self.module = mod
	def setValue(self, val):
		self.value = val
	def setDoc(self, doc):
		self.docs = doc
	def toString(self):
		return "{'name': " + f"'{self.name}'" + ", 'module': " + f"'{self.module}'" + ", 'value'" + f"'{self.value}'" + "}"
	
def is_number(value):
    try:
        float(value)
        return True
    except ValueError:
        return False
	

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
			mod = globals[k]
			# print(globals[k])
			# print(test)
			if callable(globals[k]):
				#print(inspect.getfile(eval(k)))
				callables.append(k)
				print("Callable: " + k)
				
				func = FunctionObj(k)
				func.setModule("")
				try:
					# print(globals[k].__code__)
					sigs = str(inspect.signature(globals[k]))
					print(sigs)
					func.addParameters(sigs)
				except ValueError as e: 
					print(e)
				
				print(func.toString())
				count += 1
				
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
			if ("class" in str(globals[k])):
				c = inspect.getmembers(globals[k])
				print("Class: " + k)
				print(c)
				for f in c:
					print(f[0])
					print(f[1])
			elif ("module" in str(globals[k])):
				modules.append(globals[k])
				if str(globals[k]) == "script":
					# Don't do anything, this is THIS script, we don't want this stuff contaminating the results
					# But there are functions here that aren't in this script.... layout_list_box_control and others
					# Might need to specifically exclude the functions in this file.
					continue
				print("Module " + k)
				print(globals[k])
				funcs = inspect.getmembers(globals[k])
				#funcs = inspect.getmembers(globals[k],inspect.isfunction)
				for f in funcs:
					try:
						# print(f[0])
						# print(str(f[1]).replace("\n"," ")),
						
						if "function" in str(f[1]):
							# print("TRUE")
							# print(k+"."+str(f[0]))
							
							# print(inspect.signature(eval(k+"."+f[0])))
							# print(inspect.signature(f))
							# print("Worked")
							func = FunctionObj(f[0])
							func.setModule(k)
							func.addParameters(inspect.signature(eval(k+"."+f[0])))
							doc = inspect.getdoc(eval(k+"."+f[0])).replace("\n","\\n")
							func.setDocString(doc)
							#print(func.toString())
							continue

						if is_number(str(f[1])):
							# print("Number!")
							# print(f"{f[0]} is a number!")
							c = Constant(f[0])
							c.setModule(k)
							c.setValue(f[1])
							doc = f[1]#inspect.getdoc(eval(k + "." + f[0])).replace("\n","\\n")
							c.setDoc(doc)
							# print(c.toString())
							continue
					except:
						pass 
				continue
			elif is_number(str(globals[k])):
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
	# Only purpose of this try statement is if the user is using an older version of sbs_utils.
	from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
	#from sbs_utils.mast.mast import Mast # type: ignore
	print(globals())
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
		# g = globals()
		# for k in g:
		# 	print(f"{k[0]}\n{k[1]}")
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



