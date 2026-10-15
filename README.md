**English** | [中文](./README.zh-CN.md)

# AutoHotkey v2 Language Support

> **Deses fork.** This is a fork of [thqby/vscode-autohotkey2-lsp](https://github.com/thqby/vscode-autohotkey2-lsp) (3.0.10 plus upstream PR #867). Everything below this section is the upstream README. Upstream changes are merged into the fork when they help.

## Differences from upstream

- **Include closure computed in one graph pass.** Upstream rebuilds `includeCache` and `includedCache` by recursing through the include graph and copying objects at every edge, which grows exponentially with shared includes. On a project whose entry script pulls in about 110 files, opening the entry script took 115 s; here it takes 0.7 s, and server memory drops from 730 MB to 360 MB. The old caches were also incomplete (on a corpus of five such projects, 631 entries were missing from the include closure and 7,312 from the reverse one); the new ones match a reference closure exactly. Code: `computeIncludeClosures` in `server/src/lexer2.ts`, tests in `server/src/test/includeClosure.test.ts`.
- **Missing includes in the Problems panel for the whole project.** With `AutoHotkey2.ProjectMissingIncludes` (on by default) every AutoHotkey file in the workspace folders is checked in the background, open or not, and a use of a class or function whose defining file the file does not include is reported as `'X' is defined in <path>, which this file does not include`. It follows the `ExplicitContextOnly` setting: turn that on to check each file only against what its own includes provide (Java-style), instead of also counting what the scripts that include it bring in. Code: `server/src/projectDiagnostics.ts`.
- **Quick fix "Add '#Include ...'".** On those warnings, `Ctrl+.` inserts the include (path relative to the file, after the last existing include or the header), or "Add N missing includes" for several at once. Code: `server/src/includeActions.ts`.
- **"Organize includes" source action** (`Shift+Alt+O`, or Source Action in the lightbulb menu). It adds missing includes that have a single candidate, removes duplicate lines, removes an include that is provably dead (the files it alone brings in contain only classes and functions, and none of their names appear in this file, in the files it includes, or in the files that include it; about one include in a hundred qualifies in the author's repos), and sorts each block of consecutive `#Include` lines: folders before files, case-insensitive, which is the order most hand-sorted blocks in the author's repos already follow. Blocks are separated by blank lines, comments and directory includes (`#Include <dir>`), so groups and load order across them are untouched. It is not run on save. Code: `server/src/organizeIncludes.ts`.
- **Mounted folders (`AutoHotkey2.MountedAt`).** A folder shared by several projects through a directory symlink (for example `automaton-commons`, which every game mounts as `app\commons`) can say where it appears inside one reference host, in its own `.vscode/settings.json`: `"AutoHotkey2.MountedAt": "../ZZZ-Automaton/app/commons"`. Its files are then analysed as the host's copy: one lexer per file instead of two, relative includes such as `..\..\types\X.ahk2` resolve into the host, symbols the host provides are found, hover and go to definition reach the host's files, and the file is checked in the host's context (as if `ExplicitContextOnly` were off for it). Diagnostics and edits still go to the file you opened. Code: `server/src/mounts.ts`, tests in `server/src/test/mounts.test.ts`.
- **The project-wide check scans every workspace folder before analysing any file**, so definitions in a folder processed later are seen.
- **Closing a file no longer wipes the include lists of files that stay loaded.** Upstream cleared them, so after closing a file other files could briefly lose symbols from their includes (false "never assigned" warnings until something re-parsed them).
- **`getRelevance` is cached** per file until the include caches change; with complete closures it had become the main cost of analysing a file (30 s of 49 s when opening every file of one project).
- **`Files.ScanMaxDepth` is actually read.** The server only looked at `Files.MaxDepth`, so the documented setting never had any effect.
- **File watcher covers `.ahk2` and `.ah2`.** Upstream only watched `*.ahk`, so changes on disk to other AHK v2 files that were not open in an editor never reached the server.
- **Builds from a clean checkout.** TypeScript is bumped to 5.9.3 and `skipLibCheck` is on, so `npm run check-types` passes.
- **Different extension id.** `deses.ahk2-lsp`, display name "AutoHotkey v2 Language Support (Deses fork)". Setting names (`AutoHotkey2.*`) are unchanged. It registers the same language and commands as upstream, so install only one of the two in a VS Code profile.

Not changed on purpose: lexers are keyed by the path as written in the `#Include`, not by real path. Projects that share a library through a directory symlink and include host files relative to it (`#Include ..\..\types\X.ahk2`) rely on that.

### Build and install

```sh
npm ci
node esbuild.mjs
npx vsce package
code --install-extension ahk2-lsp-3.1.1-deses.1.vsix
```

### Merging upstream

```sh
git remote add upstream https://github.com/thqby/vscode-autohotkey2-lsp.git
git fetch upstream
git merge upstream/main
```

Conflicts are most likely in `server/src/lexer2.ts` (the include closure block) and `package.json` (name, publisher, version, `editor.defaultFormatter`). Run `npm run check-types` and `npm test` afterwards.

[![installs](https://img.shields.io/visual-studio-marketplace/i/thqby.vscode-autohotkey2-lsp?label=Extension%20Install&style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=thqby.vscode-autohotkey2-lsp)
[![version](https://img.shields.io/visual-studio-marketplace/v/thqby.vscode-autohotkey2-lsp?label=Extension%20Version&style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=thqby.vscode-autohotkey2-lsp)
[![](https://img.shields.io/badge/Compatibility-autohotkey%20v2.0+-green?style=for-the-badge&logo=autohotkey)](https://www.autohotkey.com/)

**Repositories**: [Github](https://github.com/thqby/vscode-autohotkey2-lsp) | [Gitee](https://gitee.com/orz707/vscode-autohotkey2-lsp)

AutoHotkey v2 Language support for VS Code, features realization based on v2 syntax analysis.
Supports running on the Web, such as `Chrome/Edge`. https://vscode.dev or https://github.dev/github/dev

If you wish to donate, donations can be sent here: [alipay](https://qr.alipay.com/fkx19566u7ctegoppmu5i13) or [alipay qrcode](./pic/alipay.jpg) or [paypal](https://paypal.me/thqby)


- [AutoHotkey v2 Language Support](#autohotkey-v2-language-support)
  - [Language Features](#language-features)
    - [Rename Symbol](#rename-symbol)
    - [Diagnostics](#diagnostics)
    - [IntelliSense](#intellisense)
    - [Signature](#signature)
    - [Document Symbol](#document-symbol)
    - [Semantic Highlight](#semantic-highlight)
    - [Tags](#tags)
    - [Document Color](#document-color)
    - [Hover](#hover)
    - [Goto Definition](#goto-definition)
    - [Find All References](#find-all-references)
    - [Code Action](#code-action)
    - [Code Format](#code-format)
    - [Custom folding](#custom-folding)
    - [Declaration document](#declaration-document)
  - [Context Menu](#context-menu)
    - [Quick Help](#quick-help)
    - [Run Script](#run-script)
    - [Run Selected Script](#run-selected-script)
    - [Compile Script](#compile-script)
    - [Debug Script](#debug-script)
    - [Generate Comment](#generate-comment)
  - [Use in other editors](#use-in-other-editors)
    - [Sublime Text4](#sublime-text4)
    - [Vim and Neovim](#vim-and-neovim)
    - [Emacs](#Emacs)
  - [Use in Web Browser](#use-in-web-browser)
  - [Sponsor](#sponsor)

## Language Features

### Rename Symbol

Rename variables and function names in the scope in batches.

![rename](./pic/rename.gif)

### Diagnostics

Simple syntax error diagnosis.

![diagnostics](./pic/diagnostics2.png)

### IntelliSense

Supports intelligent completion of variables, functions, parameters, class names, and method names within the scope (by simple type deduction), and supports the completion of include files and function libraries.

Support specifying jsdoc tags (`@protected`, `@private`) for class members and global variables to exclude them from the completion list of the corresponding scope.
- Private and protected class members are respectively visible within the current class, within the current class and within its subclasses.
- Private and protected global variables are respectively visible in the current file, files in the same-level and lower-level directories.

![snippet1](./pic/snippet.png)

![snippet2](./pic/snippet.gif)

### Signature

Support for intelligent prompts for function parameters.

![signature](./pic/signature.gif)

### Document Symbol

1. Displays class, method, function, variable, label, hotkey, hot string, block information in the left outline column.
2. press Ctrl + P, Input @symbol_name to retrieve and jump
3. You can comment a method with a semicolon or /\* \*/ on the top line of a function, variable. Jsdoc-style annotations can mark variable types.

<!-- just for highlight -->

```js
/**
 * @param {Array} a - a param
 * @return {Integer}
 */
fn(a*) {
  /** @type {Map} */
  d := Map()
  /**
   * @var {Map} e
   * @var {Object} f
   */
  e := Map(), f := {}
  /** @type {(a,b)=>Integer} */
  cb := (a, b) => a + b
  /** @type {ComObject<Excel.Sheet.12,Workbook>} */
  wb := ComObject('Excel.Sheet.12')
  return a[1] + a[2]
}
class abc {
  /** @type {Map} */
  p := dosomethingandreturnmap()
}
```

### Semantic Highlight

Semantic highlighting is an addition to syntax highlighting, resolves symbols in the context of a project. The editor applies the highlighting from semantic tokens on top of the highlighting from grammars.

![semanticTokens](./pic/semanticTokens.png)

### Tags

usage: Add `;;`(default) or `; TODO ` to the comment code Tags.

![codeSymbole](./pic/codeSymbol.png)

### Document Color

Compute and resolve colors inside a document to provide color picker in editor.

![documentcolor](./pic/documentcolor.png)

### Hover

Supports hover prompts and comments for scoped variables, functions, global classes, and labels.  
usage: Move the mouse over the symbol.

![hover](./pic/hover.png)

### Goto Definition

1. Support for jumping to the declaration location of scoped variables, functions, global classes, and labels.
2. usage: Press ctrl Then move the mouse over to the code and click.

![gotoDefinition](./pic/gotoDefinition.png)

### Find All References

See all the source code locations where a certain variable/function is being used.

### Code Action

Select or hover over the code, then activate the code action menu and select action item. The supported code actions are as follows:

- Convert to code block with braces
- Convert to parenthesized function call style
- Batch include files
- Remove unused symbols
- Replace unexpected characters

### Code Format

usage:

- Right-click the popup menu and click "Format document".
- Press `Shift+Alt+F`.
- Supports formatting code blocks when typing '}', formatting lines and indenting lines when typing '\n'. (`editor.formatOnType` needs to be enabled)
- Supports the use of formatting instructions `;@format array_style: collapse, object_style: expand` to change the object style of different blocks

![codeFormat](./pic/codeFormat.gif)

### Custom folding

Fold the part between `;@region tag` and `;@endregion`, `;{` and `;}`

```ini
;@region tag
code
;@endregion
```

### Declaration document

The declaration file is a file with the suffix of `.d.ahk` as the file name, which is used to describe the implemented functions or classes, etc., does not contain the implementation part of the code, and is referenced by the ahk file with the same name by default, and the syntax refers to `ahk2.d.ahk` provided by the extension. The declaration file can extend or rewrite the declaration of ahk built-in functions or classes, and the annotation document can be separated from the source code to provide a multilingual version of intellisense. In addition, you can modify `AutoHotkey2.Syntaxes` setting of extension to replace the built-in declaration file with a third-party declaration file, such as
- [GroggyOtter's ahkv2_defintion_rewrite](https://github.com/GroggyOtter/ahkv2_definition_rewrite).

```
; array.d.ahk
; #ClsName represents the ahk built-in class
/** @extends {#Array} */
class Array<T = Any> {
  /** jsdoc-default */
  Filter(FilterFunc) => Array<T>
}

; array.zh-cn.d.ahk
; #ClsName 表示ahk内置类
/** @extends {#Array} */
class Array<T = Any> {
  /** jsdoc-zh */
  Filter(FilterFunc) => Array<T>
}

; array.ahk
; %A_Locale% is VSCode's Display Language
;@reference array.%A_Locale%.d.ahk
Array.Prototype.DefineProp('Filter', { call: Array_Filter_impl })
```

## Context Menu

### Quick Help

Open the help file and navigate to the keyword at the current cursor.

### Run Script

Run the currently open script.

### Run Selected Script

Run the code snippet at the cursor selection.

### Compile Script

Compile the script to generate executable EXE files.

### Debug Script

No additional configuration is required to start the installed Debug extensions, and support debugging with parameters.

### Generate Comment

Generate JSDOC-style comments for a function or method.

## Use in other editors

1. Install [Node.js](https://nodejs.org/en/download/).
2. Download vscode-autohotkey2-lsp server using command line, or download and unpack through [vscode marketplace](https://marketplace.visualstudio.com/items?itemName=thqby.vscode-autohotkey2-lsp).

```shell
mkdir vscode-autohotkey2-lsp
cd vscode-autohotkey2-lsp
curl.exe -L -o install.js https://raw.githubusercontent.com/thqby/vscode-autohotkey2-lsp/main/tools/install.js
node install.js
```

3. Set the LSP configuration of the editor that support [LSP(Language Server Protocol)](https://microsoft.github.io/language-server-protocol/), such as Sublime Text4, Vim, Neovim, Emacs, [etc](https://microsoft.github.io/language-server-protocol/implementors/tools/).

### Sublime Text4

- `Package Control: Install Package`, and install [Sublime LSP](https://github.com/sublimelsp/LSP) plug-in.
- `Preferences: LSP Settings`, add lsp configuration, language selector, and syntax highlighting. This is a simple example [syntax highlighting](https://github.com/thqby/vscode-autohotkey2-lsp/files/9843973/AutoHotkey2.sublime-syntax.zip), save the file in a similar path `C:\Users\<USERNAME>\AppData\Roaming\Sublime Text\Packages\User\LSP-ahk2\AutoHotkey2.sublime-syntax`.

```json
{
  "clients": {
    "lsp-ahk2": {
      "enabled": true,
      "command": [
        "node",
        "<VSCODE-AUTOHOTKEY2-LSP>/server/dist/server.js",
        "--stdio"
      ], // Update the path of node.exe(maybe it's already in PATH, so you don't need to set it) and the folder of vscode-autohotkey2-lsp
      "selector": "source.ahk2", // Same as scope in AutoHotkey2.sublime-syntax
      "schemes": ["file", "buffer", "res"],
      "initializationOptions": {
        "locale": "en-us", // or "zh-cn"
        "fullySemanticToken": true, // Provide more semantic tokens
        "AutoLibInclude": "Disabled", // or "Local" or "User and Standard" or "All"
        "CommentTags": "^;;\\s*(?<tag>.+)",
        "CompleteFunctionParens": false,
        "Diagnostics": {
          "ClassStaticMemberCheck": true,
          "ParamsCheck": true
        },
        "ActionWhenV1IsDetected": "Continue",
        "FormatOptions": {
          "array_style": "none",           // or "collapse" or "expand"
          "break_chained_methods": false,
          "ignore_comment": false,
          "indent_string": "\t",
          "max_preserve_newlines": 2,
          "brace_style": "One True Brace", // or "Allman" or "One True Brace Variant"
          "object_style": "none",          // or "collapse" or "expand"
          "preserve_newlines": true,
          "space_after_double_colon": true,
          "space_before_conditional": true,
          "space_in_empty_paren": false,
          "space_in_other": true,
          "space_in_paren": false,
          "wrap_line_length": 0
        },
        "InterpreterPath": "C:/Program Files/AutoHotkey/v2/AutoHotkey.exe",
        "WorkingDirs": [],
        "SymbolFoldingFromOpenBrace": false
      }
    }
  },
  "semantic_highlighting": true
}
```

### Vim and Neovim

#### COC
- Download [coc.nvim plugin](https://github.com/neoclide/coc.nvim).

```bat
cd $VIMRUNTIME\plugin
git clone --branch release https://github.com/neoclide/coc.nvim.git --depth=1
```

- Open (n)vim and enter the command `:CocConfig` to enter the `coc.nvim` configuration file to add configuration information.

```json
{
  "languageserver": {
    "lsp-ahk2": {
      "module": "<VSCODE-AUTOHOTKEY2-LSP>/server/dist/server.js",
      "filetypes": ["autohotkey"],
      "args": ["--node-ipc"],
      "initializationOptions": {
        // Same as initializationOptions for Sublime Text4
      }
    }
  }
}
```

#### nvim-lspconfig
- Download [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig) and install the plugin [ray-x/lsp_signature.nvim](https://github.com/ray-x/lsp_signature.nvim).
- Add the following to your NVIM configuration (init.lua e.g.). Ensure that `cmd` points to the path of your vscode-autohotkey2-lsp installation and `InterpreterPath` points to your AHK exe.

```lua
local function custom_attach(client, bufnr)
  require("lsp_signature").on_attach({
    bind = true,
    use_lspsaga = false,
    floating_window = true,
    fix_pos = true,
    hint_enable = true,
    hi_parameter = "Search",
    handler_opts = { "double" },
  })
end

local ahk2_configs = {
  autostart = true,
  cmd = {
    "node",
    vim.fn.expand("$HOME/vscode-autohotkey2-lsp/server/dist/server.js"),
    "--stdio"
  },
  filetypes = { "ahk", "autohotkey", "ah2" },
  init_options = {
    locale = "en-us",
    InterpreterPath = "C:/Program Files/AutoHotkey/v2/AutoHotkey.exe",
    -- Same as initializationOptions for Sublime Text4, convert json literal to lua dictionary literal
  },
  single_file_support = true,
  flags = { debounce_text_changes = 500 },
  capabilities = capabilities,
  on_attach = custom_attach,
}
local configs = require "lspconfig.configs"
configs["ahk2"] = { default_config = ahk2_configs }
local nvim_lsp = require("lspconfig")
nvim_lsp.ahk2.setup({})
```

### Emacs

#### Eglot
- Add the following lines to your emacs config file

``` emacs-lisp
(add-to-list 'eglot-server-programs '(ahk-mode "node" "<VSCODE-AUTOHOTKEY2-LSP>/server/dist/server.js" "--stdio"))

```

## Use in Web Browser

visit https://github.dev or https://vscode.dev in `Chrome/Edge`, and install `thqby.vscode-autohotkey2-lsp`
