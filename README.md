# mast README

An extension for developing missions for [Artemis Cosmos](https://www.artemisspaceshipbridge.com/#/).
It is intended to facilitate developing mission scripts using the [MAST language](https://artemis-sbs.github.io/sbs_utils/mast/).

MAST references:
[sbs_utils repository](https://github.com/artemis-sbs/sbs_utils)
[LegendaryMissions repository](https://github.com/artemis-sbs/LegendaryMissions)
[Artemis Cosmos bug reporting](https://github.com/artemis-sbs/LegendaryMissions/issues)

## Features

Includes:
* Basic formatting and coloring, based on Python
* Error checking
	* Checks if labels are defined, and defined properly
	* Checks for proper route label usage
	* Proper f-string usage
	* Checks if label names are overriden by a variable name
* Autocompletion for applicable functions within the sbs and sbs_utils packages
	* sbs package
	* scatter package
	* faces package
	* sbs_utils/procedural
* Autocompletion for variables etc in current file and files in scope
	- NOTE: It's virtually impossible to determine the type of a variable programmatically. The extension can't really do it, so you'll have to keep track of what each variable represents.
	The extension will give you options that show the object type associated with that option.
* Autocompletion for labels in current file and files in scope
* Function signature information (i.e. notes on argument types)
* Go To Definition functionality
* Checks for module versions
	* Can update all to latest version, or manually update
* In mission folders, checks for `__init__.mast` in the folder you're working in. If it doesn't exist, will promt with an option to auto-generate the file, with all .mast and .py files included automatically.
* Autocompletion of filenames for `__init__.mast`
* Checks or root artemis directory existence - most functionality requires the opened folder to be in the artemis mission directory

## Requirements

Dependencies should be packaged with the extension. If you encounter an issue with a dependency, or it is not included, please let me know ASAP.
Included dependencies:
* adm-zip
* hjson
* python-shell
* vscode-uri

## Known Issues

* Many known global modules, functions, and variables (e.g. math, random, len, sim, etc - see [mast_globals.py](https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/mast/mast_globals.py) for full list of globals) are not implemented in autocomplete yet - this is WIP.
* See [GitHub](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues) for other issues.

## Planned Features

* Additional error checking
* Check that functions contain the correct number of arguments
* Variable type checking in functions

## Release Notes

See the [Changelog](https://marketplace.visualstudio.com/items/astrolamb.mast/changelog)

## Contributions

Contributions are more than welcome! I am by no means an expert when it comes to language servers, VS Code extensions, or even programming in general - I'm just able to muddle through and figure things out as I go. I will not claim that this extension is optimized in any way, I'm just trying to make it functional. Help would be great!

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
