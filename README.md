# mast README

This extension is being designed to facilitate developing missions using the [MAST language](https://artemis-sbs.github.io/sbs_utils/mast/).

## Features

Currently a bare-bones extension for developing missions for [Artemis Cosmos](https://www.artemisspaceshipbridge.com/#/).
Includes:
* Basic formatting and coloring, based on Python
* Error checking
	* Checks if labels are defined, and defined properly
	* Checks for proper route label usage
* Autocompletion for functions within the sbs and sbs_utils packages
* Function signature information (i.e. notes on argument types)

## Requirements

Dependencies should be packaged with the extension. If you encounter an issue with a dependency, or it is not included, please let me know ASAP.
Included dependencies:
* adm-zip
* vscode-uri

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.

## Known Issues

See [GitHub](https://github.com/astrolamb-gaming/VS-Code-MAST-Extension/issues) for issues.

## Planned Features

* ~~Implement autocompletion for class functions~~
* Additional error checking
* Variable type checking in functions
* Autocompletion for variables etc in current file
* Autocompletion based on files in the same folder
* Autocompletion based on modules (e.g. Legendary Missions)

## Release Notes

See the [Changelog](https://marketplace.visualstudio.com/items/astrolamb.mast/changelog)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
