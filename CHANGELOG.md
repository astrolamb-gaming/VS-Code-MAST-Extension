# Change Log

All notable changes to the "mast" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

### To-DO and WIP

* TODO: Add more info about shipdata entries to the art arguments for space objects
* WIP: Get mast complier errors from the compiler itself, so the game doesn't have to be running to check for compiler errors.


### 0.15.0
* Implement hover, Go To Definition, and Find References for function names (e.g. `len` instead of `len()`)
* Refactor of Route checks to fix some related issues
* Add Find References and Autocompletion for Signals [#33](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/33), as well as validation for if signals are emitted and used
* Add function parameter names to autocompletion when inside a function [#32](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/32)
* Add broad_type value autocompletions
* Fixes for route and label autocompletions
* Fix for style definitions
* Variables in the current file and route variables are now the priority for autocompletion options
* Added filesystem watcher, which triggers a cache or globals update when changes are made to the following:
	- Lib Folder
	- story.json
	- Removed files
	- shipData.json/.yaml
* Add check for if `story.json` exists, if not prompts the user if one should be generated (previously the LSP would crash) [#38](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/38)
* Improve metadata information
* Fix for issue where if sbs_utils was packaged with an error, the extension would crash
* Add check for labels with same name as variable and vice versa
* Add Widget names to autocompletion


### 0.14.0
* Add icon to autocompete information for functions with the icon_index parameter
* Fix for use of `#region....#endregion` for collapseable code blocks
* Fix autocompletion for named arguments in function calls

### 0.13.0
* Add blob values for get/set_data_set_value functions
* Fix issues with signature determination for some functions
* Update sbs particle function descriptorString autocompletions based on widget_stylestring_documentation.txt

### 0.12.0

* Add python built-in module information based off of mast_globals.py, so it is forward-compatible
* Fixed a pretty big issue where multiple copies of information for each file was being stored in memory
* Add lifeform support (i.e. LIEFORM_ID)
* Fix some small role related bugs
* Fix issue with sublabels not showing up for autocompletion
* Fix issue where sometimes sublabels would incorrectly show an error saying the sublabel wasn't defined in the main label
* Better hover information generation, including for class methods
* Show warning for code block starts that should have a colon if the colon isn't present (e.g. `if`, `with`, etc)
* Add `behave_id` options to autocomplete for applicable function parameters (i.e. spawns)
* Fix issue where projects without mast files would still try to load the extension.

### 0.11.0

* Add support for Find All References
* Fix bug that caused the global information to get parsed twice
* Fix art autocompletions to correctly use the "key" key in shipData.json instead of "artfileroot"
* Fix for block comments
* Add `__player__` as a default role option
* Add metadata keys as variables
* Add map properties as variables


### 0.10.2

* Fix for weighted strings not being recognized as strings in certain situations
* Add autocompletion for label data keys
* Fix bug in determining what argument is the current one
* Fix issue where strings weren't being parsed correctly
* Fix for info if a file is deleted
* Add variables from modules to autocompletion
* Add proper auto-indentation!
* Remove unnecessary info for mast nodes


### 0.10.1

* Add style string autocompletions for non-sbs functions (e.g. color, area, etc.), anytime a function has a parameter named "style"
* Fix for giving `__init__.mast` missing errors for mast files in root mission folder [#10](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/10)
* Update autocomplete documentation display
* Removed some extraneous error checking for labels that caused false positive errors
* Add formatting support for random text generator syntax
* Fix [#8](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/8)
* Fix [#9](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/9), which caused incorrect errors for some labels
* Add label autocompletions for all functions that use have an argument called 'label'


### 0.10.0

* Add autocompletion for keys used in set/get_inventory_value() and related functions
* Add autocompletion for objects
* Major overhaul to drastically cut down on computational and memory resource usage
* Add spaceobject.py and agent.py files
* By default, tabs will be used instead of spaces for indentation
* More thorough fix for sbs module to fix [#3](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/3)
* Add Go To Definition for sbs module
* Fix autocompletion and signature information issue when using nested functions [#4](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues/4)
* Fix scatter module
* Fix for various minor error messages and fstring checks
* Update formatting for yield and button definitions
* Add StateLabel formatting
* Allow use of sbs module if offline, assuming that it has been loaded previously


### 0.9.1

* Fix for loading tims from version 0.9.0, which also fixed an error when using multiple workspaces
* Add loading indicator while the extension is loading information related to a given mission
* Fixed reference for the sbs module, so now it will properly show the current sbs functions
* Error messages for story.json now include the name of the mission, in case there are multiple story.json files that might need updated


### 0.9.0

* Note that the loading time for the extension has increased a bit due to more operations being done on startup - I'll work on this for later updates
* Add error if a variable name overrides a label name
* Add label information on hover
* Add Go To Definition for modules
	* If the module exists as a regular mission, directs to the mission folder
* Fix bugs related to string and comment parsing when switching between files
* Fix for variables with keywords like default or shared
* Add default, assigned, client, and temp as keywords for autocompletion
* Updated hovers such that there's less wasted space when there's no documentation
* Fix for error in metadata, it thought lists were malformed labels
* Added check for if a label is a prefab (TODO: Check if it's an objective, brain, etc)
* Fix for workspaces


### 0.8.0

* Add function information on hover
* Add blob entry information on hover
* Add simulation class functions when using the sim global variable
* Add functions that should have the module name prepended to them (e.g. functions in names.py are used in a format like `names_random_arvonian_name()`)
* Add autocompletion for shipData.json entries
	* Add images as part of autocompletion for art_id parameters for functions
* Add EVENT as a route label variable
* Add event class properties to autocompletion for EVENT
* Add vec.py for the Vec3 class
* Add source reference for sbs, sbs_utils, and LegendaryMission functions in the hover information. Link takes you to the appropriate github page.
* Fix for file name checking of python files
* Fix for variable detection
* Fix for duplicate label check
* Change to use markdown instead of just text for function information - easier to read

### 0.7.0

* Fix keyword autocompletion
* Fix on change formatting
* Add autocompletion for roles within scope
* Get roles based on shipData.json, accounting for possible invalid json
* Add autocompletion to `__init__.mast`, giving all files not already listed in the file.

### 0.6.0

* Fix for crash that could occur if opening a folder without an `__init__.mast` file or if opening a workspace
* Fix sbs, scatter, and faces functions showing up without the applicable global name prepended
* Fixes for autocompletion and error checking of route labels and route label variables
* Add check for use of routes that require them to be enabled first
* Add WARN, WARNING, ERR, and ERROR as codetags
* Fix error for checking if last line is empty (it should be empty)
* Fix for labels being misidentified as routes in some cases
* Add check for `__init__.mast` file. If it's not there, it will prompt the user to create one
* Fixes for metadata ranges
* Removed hover functionality (which is still incomplete) for non-mast files
* Added capability for autocompletion and signatures in metadata value strings

### 0.5.1

* Hotfix for error message showing up in strings and comments
* Add style string information to method signatures for applicable functions based on widget_stylestring_documentation.txt

### 0.5.0

* Add variable names to autocomplete
* Add variables from files in scope to autocomplete
* Add labels from files in scope to autocomplete (e.g. with jump command)
* Add scatter and faces modules to autocomplete
* Add check for proper fstring formatting
* Fixes for string and comment checks
* Add checks for `story.json` contents
	* Checks if files referenced in `story.json` exist
	* Checks for more recent versions of the files referenced in `story.json`
	* Popup that allows you to update to the latest version, or manually update the file
	* When manually changing `story.json`, autocompletion options include all files in the `\missions\__lib__\` folder.
* Add check for artemis root directory with a warning if the root directory is not found
* Add sending language server logs to the client for viewing/debugging
* Minor formatting fixes

### 0.4.0

* Blob string options added to autocomplete when you type `.set(` or `.get(`, followed by double or single quotes.
* Fix some edge-case formatting issues
* Update mast file icon with two new icons, one each for light and dark mode
* Fix format definitions and await inline labels showing up as label errors
* Add idle as a valid yield result
* Fix for issue where multiple instances of inline labels with different parent labels caused false errors
* Add check for label warning message if it's not defined in the current folder , instead of just checking the current file.
* Add lots of error handling to prevent crashes, and error messages with what caused the error.
* Fix for button names not formatted properly if variables used in them (i.e. "Button {name}" )

### 0.3.0

* Added parsing of zipped files specified in story.json
* Added parsing of all .mast and .py files in working directory
* Added autocompletion entries for labels for all .mast files in the working directory
* Tons of formatting changes:
	* Allow for more possible variations for strings, including f-strings
	* More accurate formatting for the various label types
	* Formatting for button and comms message syntax
	* Probably a lot more that I don't recall right now

### 0.2.0

* Added additional label and route label error checking
* Added autocompletion for class functions (can't yet determine variable types though)
* Added SignatureInformation for functions

### 0.1.0

* Initial beta release of MAST Extension