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
		print("sys.argv[3] is not None")
		pass
except:
	pass
# print(sbs_utilsPath)

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
		return "{'name': " + f"'{self.name}'" + ", 'module': " + f"'{self.module}'" + ", 'value': " + f"'{self.value}'" + "}"
	
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
	print("Getting globals")
	count = 0
	for k in globals:
		if k.startswith("__"):
			continue
		try:
			mod = globals[k]
			# print(globals[k])
			# print(test)
			if callable(globals[k]):
				
				#print(inspect.getfile(eval(k)))
				callables.append(k)
				print("Callable: " + k)
				
				func = FunctionObj(k)
				
				try:
					doc = inspect.getdoc(eval(k)).replace("\n","\\n")
					func.setDocString(doc)
				except AttributeError as e:
					# print(e)
					pass
				except NameError as e:
					pass

				try:
					# print(globals[k].__code__)
					# help(globals[k]) #doens't work
					#print(inspect.getargs(eval(k)))
					sigs = str(inspect.signature(globals[k]))
					func.addParameters(inspect.signature(eval(k)))
					# func.addParameters(sigs)
					
				except ValueError as e: 
					# print(e)
					pass
				
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
			# if ("class" in str(globals[k])):
			# 	c = inspect.getmembers(globals[k])
			# 	print("Class: " + k)
			# 	print(c)
			# 	for f in c:
			# 		print(f[0])
			# 		print(f[1])
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
						if k == "itertools":
							print(f)
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
						if "class" in str(f[1]):
							func = FunctionObj(f[0])
							func.setModule(k)
							try:
								func.addParameters(inspect.signature(eval(f[0]+".__init__")))
								doc = inspect.getdoc(eval(f[0]+".__init__")).replace("\n","\\n")
								func.setDocString(doc)
							except:
								pass
							print(func.toString())

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
				s = Constant(k)
				s.setValue(globals[k])
				s.setDoc(globals[k])
				print("Number")
				print(s.toString())
				continue
			elif k == "sim":
				s = Constant(k)
				s.setValue = ""
				s.setDoc("The game simulation object")
				s.module = ""
				print(s.toString())
			else:
				print("OTHERS")
				print(k)
				print(globals[k])
				c = Constant(k)
				print(type(globals[k]))
				c.setValue(globals[k])
				c.setDoc(globals[k])
				print(c.toString())

			#m = test.__module__
			#print(f"{k} from {m}")
		except Exception as e:
				exc_type, exc_value, exc_tb = sys.exc_info()
				stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
				print(stack_trace)
				continue
	print("Count: " + str(count))

class Entry:
	name = ""
	kind = ""
	docs = ""

def getOnlyGlobals(globals):
	# print("getOnlyGlobals()")
	globalNames = []
	for k in globals:
		mod = str(globals[k]).replace("\\","/")
		# ret = "{"+f"\"name\":\"{k}\",\"value\":\"{mod}\"" + "}"
		ret = Entry()
		ret.name = k
		if inspect.getdoc(globals[k]) is not None:
			ret.docs = inspect.getdoc(globals[k])
		if callable(globals[k]):
			ret.kind = "function"
		elif "module" in str(globals[k]):
			ret.kind = "module"

		# print(k)
		# print(globals[k])
		# print(callable(globals[k]))

		# Now let's just look at the non-callable ones
		globalNames.append(ret.__dict__)
		if not callable(globals[k]):
			# print(k)
			# print(globals[k])
			if ("module" in str(globals[k])):
				# print("Is module")
				pass
	return globalNames
# try:
# print(sbsPath)
if sbsPath is not None:
	sys.path.append(sbsPath)
sys.path.append(sbs_utilsPath)
# print(sbs_utilsPath)
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
		getGlobals(MastGlobals.globals)
		
		# globalsList = getOnlyGlobals(MastGlobals.globals)
		# import json
		# print(json.dumps(globalsList))

	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		print("Last possible load")
		print(stack_trace)

compare()
# except Exception as e:
# 	exc_type, exc_value, exc_tb = sys.exc_info()
# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 	print(stack_trace)



