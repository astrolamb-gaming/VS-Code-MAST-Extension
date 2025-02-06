# Change Log

All notable changes to the "mast" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Show token information on hover

### 0.3.0

- Added parsing of zipped files specified in story.json
- Added parsing of all .mast and .py files in working directory
- Added autocompletion entries for labels for all .mast files in the working directory
- Tons of formatting changes:
	* Allow for more possible variations for strings, including f-strings
	* More accurate formatting for the various label types
	* Formatting for button and comms message syntax
	* Probably a lot more that I don't recall right now

### 0.2.0

- Added additional label and route label error checking
- Added autocompletion for class functions (can't yet determine variable types though)
- Added SignatureInformation for functions

### 0.1.0

- Initial beta release of MAST Extension