# VS Code Terminal Keybindings

This document records the custom VS Code terminal shortcuts used on this machine and how to recreate them on another computer.

## Current Shortcuts

| Shortcut | Action |
| --- | --- |
| `alt+[Backquote]` | Show/hide the integrated terminal using the physical `º` key on Spanish keyboards |
| `alt+shift+q` | Create a new integrated terminal |
| `alt+q` | Focus the integrated terminal without opening or closing it |
| `alt+j` | Show/hide the bottom panel |
| `alt+f2` | Rename the focused terminal (works from tabs or terminal) |
| `alt+x` | Close the focused terminal |
| `alt+1` to `alt+9` | Focus terminal by tab number |
| `alt+w` | Focus previous terminal |
| `alt+s` | Focus next terminal |
| `shift+enter` | Send `Escape` + `Enter` to the focused terminal |

All terminal navigation/close shortcuts are scoped with `"when": "terminalFocus"` where appropriate, so they only apply while the terminal has focus. The `alt+f2` rename binding uses both `terminalFocus` and `terminalTabsFocus`, and it also requires the terminal commands-to-skip-shell setting shown below.

## How To Apply On Another Computer

1. Open VS Code.
2. Open the Command Palette with `ctrl+shift+p`.
3. Run `Preferences: Open Keyboard Shortcuts (JSON)`.
4. Add or merge the following entries into the JSON array.

```json
[
    {
        "key": "shift+enter",
        "command": "workbench.action.terminal.sendSequence",
        "args": {
            "text": "\u001b\r"
        },
        "when": "terminalFocus"
    },
    {
        "key": "alt+x",
        "command": "workbench.action.terminal.kill",
        "when": "terminalFocus"
    },
    {
        "key": "alt+[Backquote]",
        "command": "workbench.action.terminal.toggleTerminal"
    },
    {
        "key": "alt+shift+q",
        "command": "workbench.action.terminal.new"
    },
    {
        "key": "alt+q",
        "command": "workbench.action.terminal.focus"
    },
    {
        "key": "alt+j",
        "command": "workbench.action.togglePanel"
    },
    {
        "key": "alt+f2",
        "command": "workbench.action.terminal.renameActiveTab",
        "when": "terminalTabsFocus"
    },
    {
        "key": "alt+f2",
        "command": "workbench.action.terminal.rename",
        "when": "terminalFocus"
    },
    {
        "key": "alt+1",
        "command": "workbench.action.terminal.focusAtIndex1",
        "when": "terminalFocus"
    },
    {
        "key": "alt+2",
        "command": "workbench.action.terminal.focusAtIndex2",
        "when": "terminalFocus"
    },
    {
        "key": "alt+3",
        "command": "workbench.action.terminal.focusAtIndex3",
        "when": "terminalFocus"
    },
    {
        "key": "alt+4",
        "command": "workbench.action.terminal.focusAtIndex4",
        "when": "terminalFocus"
    },
    {
        "key": "alt+5",
        "command": "workbench.action.terminal.focusAtIndex5",
        "when": "terminalFocus"
    },
    {
        "key": "alt+6",
        "command": "workbench.action.terminal.focusAtIndex6",
        "when": "terminalFocus"
    },
    {
        "key": "alt+7",
        "command": "workbench.action.terminal.focusAtIndex7",
        "when": "terminalFocus"
    },
    {
        "key": "alt+8",
        "command": "workbench.action.terminal.focusAtIndex8",
        "when": "terminalFocus"
    },
    {
        "key": "alt+9",
        "command": "workbench.action.terminal.focusAtIndex9",
        "when": "terminalFocus"
    },
    {
        "key": "alt+w",
        "command": "workbench.action.terminal.focusPrevious",
        "when": "terminalFocus"
    },
    {
        "key": "alt+s",
        "command": "workbench.action.terminal.focusNext",
        "when": "terminalFocus"
    }
]
```

Also make sure `settings.json` contains:

```json
{
    "terminal.integrated.commandsToSkipShell": [
        "workbench.action.terminal.rename",
        "workbench.action.terminal.renameActiveTab"
    ]
}
```

If the target file already contains other keybindings, do not replace the whole file. Copy only the objects above into the existing top-level array and keep valid JSON commas between entries.

## Conflict Notes

`alt+[Backquote]`, `alt+q`, `alt+shift+q`, `alt+j`, and `alt+f2` are usually safe because they are not common VS Code or Windows menu shortcuts in the terminal context. On Spanish keyboards, `[Backquote]` is normally the physical `º` key.

`alt+w`, `alt+s`, `alt+x`, `alt+f2`, and `alt+1` to `alt+9` are intercepted by VS Code while the terminal has focus. This is intentional, but it means terminal applications such as Claude Code, OpenCode, shells, editors, or TUIs will not receive those exact key combinations.

## AI Prompt

Use this prompt if you want an AI assistant to apply the same setup on another machine:

```text
Update my VS Code `keybindings.json` and `settings.json` to configure these integrated terminal shortcuts:

- alt+[Backquote]: workbench.action.terminal.toggleTerminal. This should use the physical `º` key on Spanish keyboards.
- alt+shift+q: workbench.action.terminal.new
- alt+q: workbench.action.terminal.focus
- alt+j: workbench.action.togglePanel
- alt+f2: workbench.action.terminal.rename, when terminalFocus
- alt+f2: workbench.action.terminal.renameActiveTab, when terminalTabsFocus
- alt+x: workbench.action.terminal.kill, only when terminalFocus
- alt+1 through alt+9: workbench.action.terminal.focusAtIndex1 through focusAtIndex9, only when terminalFocus
- alt+w: workbench.action.terminal.focusPrevious, only when terminalFocus
- alt+s: workbench.action.terminal.focusNext, only when terminalFocus
- shift+enter: workbench.action.terminal.sendSequence with args text "\u001b\r", only when terminalFocus

Also set `terminal.integrated.commandsToSkipShell` to include:

- workbench.action.terminal.rename
- workbench.action.terminal.renameActiveTab

Please preserve any existing unrelated keybindings and settings, merge these entries into the existing files, keep both files valid JSON, and validate the result after editing.
```
