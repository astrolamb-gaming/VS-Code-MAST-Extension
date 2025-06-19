#!/usr/bin/env python
from inspect import *
import traceback
import sys
import os

def debug(info=""):
	print("Debug: " + info)
def exception(info=""):
	print("Except: \n" + info)

# PYTHONPATH=/path/to/myArchive.zip python -m [filename without extension] [args]

content = ""
sbsPath = ""
sbs_utilsPath = ""
lineCount = 0
getData = False

sbs_utilsPath = sys.argv[1] # Very important
sbsPath = sys.argv[2] # Will not be important in the future - v1.0.2 does not require sbs

# Artemis exe directory
artDir = sys.argv[3]

# This is the dir of the mission folder plus story.mast
mastFile = sys.argv[4] # Very important
mastFileFull = mastFile

file = mastFile
while not os.path.dirname(file).endswith("missions"):
	file = os.path.dirname(file)
missionDir = os.path.dirname(file)
debug("Mission Dir: " + file)

debug("artDir: " + artDir)
debug(mastFile)

debug(os.path.dirname(mastFile))

# Set the working directory
# os.chdir(os.path.dirname(mastFile))
os.chdir(artDir)
debug(os.getcwd())


# Set the mastfile base name (e.g. story.mast)
mastFile = os.path.basename(mastFile)
debug(mastFile)

# print(sbs_utilsPath)
# print(sbsPath)
# print(mastFile)
# import sys
# sys.exit(0)
try: 
	
	content = sys.argv[5] # Very important
except Exception as e:
	try:
		content = sys.stdin.read().replace("\r","")
		# lines = content.split("\n")
	except:
		# print("Issue with content?")
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		exception(stack_trace)
sys.path.append(sbsPath)
sys.path.append(sbs_utilsPath)

errors = None

##### This prevents an exception from sbs_mast_procedural.py that gets the value of `sys.modules['script']`
sys.modules['script'] = sys.modules.get('__main__')

try:
	from sbs_utils.mast.maststory import MastStory # type: ignore
except Exception as e:
	try:
		sys.path.append(sbsPath)
		sys.path.append(sbs_utilsPath)
		from sbs import * # type: ignore
		from sbs_utils.mast.maststory import MastStory # type: ignore
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		# print(stack_trace)
loaded = False
try:
	from sbs_utils.mast.mast_sbs_procedural import * # type: ignore
	#from sbs_utils.mast.mast import Mast # type: ignore
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
		from sbs_utils import fs

		fs.exe_dir = artDir
		# fs.script_dir = os.path.dirname(mastFileFull)
		fs.script_dir = missionDir
		fs.script_dir = fs.script_dir.replace("/", "\\")

		## This will throw an expection unless you use
		## "sys.modules['script'] = sys.modules.get('__main__')"
		## earlier in the script.
		from sbs_utils.mast_sbs.mast_sbs_procedural import * # type: ignore		
		loaded = True
	except:
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		exception(stack_trace)
		# import sys
		# sys.exit(0)

	class MyMast(MastStory):
		def __init__(self, cmds=None, is_import=False):
			super().__init__(cmds,is_import)
		# def import_python_module_for_source(self, name, lib_name):
		# 	pass
		# def find_add_ons(self, folder):
		# 	return []
		# def expand_resources(arg):
		# 	pass
		def from_file2(self, file_name, root):
			if root is None:
				root = self # I am root

			if self.lib_name is None and root.imported.get(file_name):
				return
			elif self.lib_name is not None and root.imported.get(f"{self.lib_name}::{file_name}"):
				return
			
			if self.lib_name is None:
				root.imported[file_name] = True
			else: 
				root.imported[f"{self.lib_name}::{file_name}"] = True

			content = None
			errors= None

			debug("From file file_name: "+file_name)
			content, errors = self.content_from_lib_or_file(file_name)
			# print(content)
			if errors is not None:
				print(errors)
				return errors
			if content is not None:
				content = content.replace("\r","")
				# debug("from_file2 content:")
				# print(content)
				errors = self.compile(content, file_name, root)
			return errors
            
		def from_text(self, file_name, root, content: str):
			""" Use this to compile text from a file that hasn't been saved, and therefore is not accessible by reading the file. """
			if root is None:
				root = self
				
			if self.lib_name is None and root.imported.get(file_name):
				debug("lib_name is None")
				return
			elif self.lib_name is not None and root.imported.get(f"{self.lib_name}::{file_name}"):
				debug("lib_name is not None")
				return
			
			if self.lib_name is None:
				root.imported[file_name] = True
			else: 
				root.imported[f"{self.lib_name}::{file_name}"] = True
			
			errors = None
				
			if content is not None:
				content = content.replace('\r','')
				# print(content)
				errors = self.compile(content, file_name, root)
			
			return errors
	try:
		# from sbs_utils.fs import get_mission_dir
		# debug("Current Working Directory:"+ get_mission_dir()) # Returns vscode dir
		debug("CWD: " + os.getcwd())
		debug()
		mast = MyMast()
		Mast.include_code = True
		# print(mast.include_code)
		# print("from_text")
		debug(mastFile)

		# We NEED to use from_text instead of from_file because we need the current, unsaved text!
		errors = mast.from_text(mastFile, None, content)
		# errors = mast.from_file(mastFile, None)
		# print(errors)
		# print("from_file")
		# errors = mast.from_file2(mastFile, None)
		if errors is None:
			debug("ERRORS IS NONE")
		# print(errors)
	except TypeError as t:
		# Extract the traceback object
		exc_type, exc_value, exc_tb = sys.exc_info()
		# Format the traceback
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		exception(stack_trace)
	except: 
		exc_type, exc_value, exc_tb = sys.exc_info()
		stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
		exception(stack_trace)
	if errors is not None:
		debug(os.getcwd())
		print(errors)
		# for err in errors:
		# 	print(err)
	else:
		debug("No Errors")
	
# import os

# # Set the working directory
# os.chdir('/path/to/your/directory')

# # Verify the current working directory
# print("Current Working Directory:", os.getcwd())



# except ModuleNotFoundError as e: 
# 	print(e)
# 	exc_type, exc_value, exc_tb = sys.exc_info()
# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 	print(stack_trace)
# except Exception as ex:
# 	print(ex)
# 	exc_type, exc_value, exc_tb = sys.exc_info()
# 	stack_trace = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
# 	print(stack_trace)
