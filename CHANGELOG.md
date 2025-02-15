# Change Log

All notable changes to the "mast" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Show token information on hover
- Determine variable types based on function return values, etc.

### 0.4.0

- Blob string options added to autocomplete when you type `.set(` or `.get(`, followed by double or single quotes.
- Fix some edge-case formatting issues
- Update mast file icon with two new icons, one each for light and dark mode
- Fix format definitions and await inline labels showing up as label errors
- Add idle as a valid yield result
- Fix for issue where multiple instances of inline labels with different parent labels caused false errors
- Add check for label warning message if it's not defined in the current folder , instead of just checking the current file.
- Add lots of error handling to prevent crashes, and error messages with what caused the error.
- Fix for button names not formatted properly if variables used in them (i.e. "Button {name}" )

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