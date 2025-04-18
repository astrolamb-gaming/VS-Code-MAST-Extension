# Change Log

All notable changes to the "mast" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

* Determine variable types based on function return values, etc.

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