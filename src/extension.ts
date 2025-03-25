import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Grep extension is activated');

  const provider = new GrepInputViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('grepInputView', provider)
  );

  let disposable = vscode.commands.registerCommand('extension.grepWords', () => {
    vscode.window.showInformationMessage('Grep function triggered!');
  });

  context.subscriptions.push(disposable);
}

class GrepInputViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext // context を受け取る
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtml();
    this.getSettingsList(webviewView.webview);
    const lastState = this.context.workspaceState.get<{ grepWords: string[], searchWords: { word: string; color: string }[] }>('lastState');
    if (lastState) {
      webviewView.webview.postMessage({
        command: 'loadSettings',
        grepWords: lastState.grepWords,
        searchWords: lastState.searchWords
      });
    }

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
      } else {
        this.restoreState(webviewView.webview);
        this.getSettingsList(webviewView.webview);
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'grep') {
        this.grepInActiveEditor(message.grepWords, message.searchWords);
      } else if (message.command === 'saveSettings') {
        this.saveSettings(message.name, message.grepWords, message.searchWords, webviewView.webview);
      } else if (message.command === 'loadSettings') {
        this.loadSettings(message.name, webviewView.webview);
      } else if (message.command === 'deleteSetting') {
        this.deleteSetting(message.name, webviewView.webview);
      } else if (message.command === 'Logger') {
        this.Loggger(webviewView.webview, message.msg);
      } else if (message.command === 'saveSettings_current') {
        this.saveStateFromWebview(message.grepWords, message.searchWords, webviewView.webview);
      }
      webviewView.webview.postMessage({ command: 'Complete' });
    });
  }

  // state を保存するメソッド
  private async saveStateFromWebview(grepWords: string[], searchWords: { word: string; color: string }[], webview: vscode.Webview) {
    const response = {grepWords: grepWords, searchWords: searchWords};
    if (response) {
      this.context.workspaceState.update('lastState', response);
      console.log('State saved:', response);
    }
  }

  private async restoreState(webview: vscode.Webview) {
    const state = this.context.workspaceState.get<{ grepWords: string[], searchWords: { word: string; color: string }[] }>('lastState');
    if (state) {
      webview.postMessage({ command: 'loadSettings', grepWords: state.grepWords, searchWords: state.searchWords });
      console.log('State restored:', state);
    }
  }

  private async grepInActiveEditor(grepWords: string[], searchWords: { word: string; color: string }[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const doc = editor.document;
    let results: string[] = [];

    for (let line = 0; line < doc.lineCount; line++) {
      const text = doc.lineAt(line).text;
      if (grepWords.some(word => text.includes(word))) {
        results.push(`${String(line + 1).padStart(8, ' ')}: ${text}`);
      }
    }

    if (results.length > 0) {
      await this.showResultsInWebview(results, searchWords);
    } else {
      vscode.window.showInformationMessage('No matches found');
    }
  }

  private async showResultsInWebview(results: string[], searchWords: { word: string; color: string }[]) {
    const panel = vscode.window.createWebviewPanel(
      'grepResults',
      'Grep Results',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const highlightedResults = results.map(line => {
      searchWords.forEach(({ word, color }) => {
        const regex = new RegExp(`(${word})`, 'gi');
        line = line.replace(regex, `<span style="background-color: ${color}; font-weight: bold;">$1</span>`);
      });
      return line;
    }).join('<br>');

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 10px;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 14px; /* 初期フォントサイズ */
            }
            button {
                margin: 2px;
                padding: 2px;
                font-size: 14px;
            }
          </style>
        </head>
        <body>
          <button onclick="resizeText(2)">Zoom In</button>
          <button onclick="resizeText(-2)">Zoom Out</button>
          <pre id=text>${highlightedResults}</pre>
          <script>
              function resizeText(step) {
                  const textElement = document.getElementById('text');
                  let currentSize = parseFloat(window.getComputedStyle(textElement).fontSize);
                  let newSize = currentSize + step;

                  // 最小フォントサイズを制限（オプション）
                  if (newSize < 10) newSize = 10;

                  // 最大フォントサイズを制限（オプション）
                  if (newSize > 40) newSize = 40;

                  textElement.style.fontSize = \`\${newSize}px\`;
              };
          </script>
        </body>
      </html>
    `;
  }

  private async saveSettings(name: string, grepWords: string[], searchWords: { word: string; color: string }[], webview: vscode.Webview) {
    const config = vscode.workspace.getConfiguration('grepExtension');
    const currentSettings = config.get<{ [key: string]: any }>('settings') || {};
    currentSettings[name] = { grepWords, searchWords };
    await config.update('settings', currentSettings, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Settings '${name}' saved`);
    this.getSettingsList(webview);
  }

  private async loadSettings(name: string, webview: vscode.Webview) {
    const config = vscode.workspace.getConfiguration('grepExtension').get<{ [key: string]: any }>('settings');
    if (config && config[name]) {
      webview.postMessage({ command: 'loadSettings', grepWords: config[name].grepWords, searchWords: config[name].searchWords });
    } else {
      vscode.window.showErrorMessage(`No settings found for '${name}'`);
    }
  }

  private async deleteSetting(name: string, webview: vscode.Webview) {
    if (!name) {
      vscode.window.showErrorMessage('No setting selected');
      return;
    }

    const config = vscode.workspace.getConfiguration('grepExtension');
    const currentSettings = config.get<{ [key: string]: any }>('settings') || {};
    currentSettings[name] = undefined;
    await config.update('settings', currentSettings, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(`Settings '${name}' deleted`);

    // 削除後に一覧を更新
    this.getSettingsList(webview);
    webview.postMessage({ command: 'Complete' });
  }


  // 設定名の一覧を取得してWebviewに送信
  private async getSettingsList(webview: vscode.Webview) {
    const config = vscode.workspace.getConfiguration('grepExtension').get<{ [key: string]: any }>('settings') || {};
    const settings = Object.keys(config);
    webview.postMessage({ command: 'updateSettingsList', settings });
  }

  private async Loggger(webview: vscode.Webview, msg: string) {
    vscode.window.showInformationMessage(`'${msg}'`);
    console.log(msg);
    console.log(vscode.window.activeColorTheme.kind);
  }

  private getHtml(): string {
    const lightColors = "['yellow', 'lime', 'red', 'aqua', 'blue', 'fuchsia', 'silver']";
    const darkColors = "['olive', 'green', 'maroon', 'purple', 'navy', 'teal', 'gray']";
    const Colors = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
      ? darkColors
      : lightColors;
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 10px;
            }
            input, button, button-main, button-sub {
              font-size: 12px;
              padding: 4px;
              width: calc(100% - 16px);
            }
            button, button-main, button-sub {
              cursor: pointer;
              margin-top: 10px;
              text-align: center;
              border-width: 1px;
            }
            button {
              background-color:rgba(249, 249, 249, 0.83);
              color: black;
            }
            button-sub {
              background-color:rgba(249, 249, 249, 0.83);
              color: black;
            }
            button-main {
              background-color: #0066CC;
              color: white;
            }
            button:hover {
              background-color: gray;
            }
            button-sub:hover {
              background-color: gray;
            }
            button-main:hover {
              background-color: #006699;
            }
            select {
              width: 100%;
              padding: 4px;
              margin-top: 10px;
            }
            .search-word {
              display: flex;
              align-items: center;
              margin-top: 5px;
            }
            .color-box {
              width: 16px;
              height: 16px;
              margin-left: 5px;
              border: 1px solid #ccc;
            }
            .center-button {
              display: flex;
              justify-content: center;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <h3>Grep</h3>
          <div id="grepContainer">
            <input type="text" class="grepInput" placeholder="Enter grep word" />
          </div>
          <div class="center-button">
            <button-sub onclick="addGrepWord()">+</button>
          </div>
          <h3>Highlight</h3>
          <div id="searchWordsContainer"></div>
          <div class="center-button">
            <button-sub onclick="addSearchWord()">+</button>
          </div>
          <div class="center-button">
            <button-main onclick="startGrep()" id="MainButtun">Grep & Highlight</button>
          </div>

          <hr>

          <h3>Setting Save & Load</h3>
            <input id="settingName" type="text" placeholder="Setting name" />
          <div class="center-button">
            <button onclick="saveSettings()">Save</button>
          </div>
          <select id="settingList"></select>
          <div class="center-button">
            <button onclick="loadSettings()" id="LoadButtun">Load</button>
            <button onclick="deleteSetting()" id="DelButtun">Delete</button>
          </div>

          <hr>

          <h3>Import & Export</h3>
          <div class="center-button">
            <input id="importSettingsinput" type="text" placeholder="Setting as JSON" />
          </div>
          <div class="center-button">
            <button onclick="importSettings()">Import</button>
            <button onclick="exportSettings()">Export</button>
          </div>

          <script>
            const vscode = acquireVsCodeApi();
            const colors = ${Colors}

            function saveSettings_current() {
              const grepWords = Array.from(document.getElementsByClassName('grepInput')).map(input => input.value).filter(word => word);
              const searchWords = Array.from(document.getElementsByClassName('searchInput')).map(input => ({
                word: input.value,
                color: input.nextElementSibling.style.backgroundColor
              })).filter(item => item.word);
              vscode.postMessage({ command: 'saveSettings_current', grepWords, searchWords });
            }

            function addGrepWord_load(word) {
              const container = document.getElementById('grepContainer');
              const input = document.createElement('input');
              input.type = 'text';
              input.className = 'grepInput';
              input.placeholder = 'Enter grep word';
              if (word != "") {
                input.value = word;
              }

              input.addEventListener('input', (event) => {
                saveSettings_current();
              });
              container.appendChild(input);
            }

            function addSearchWord_load(word, color) {
              const container = document.getElementById('searchWordsContainer');
              const index = container.children.length;
              const div = document.createElement('div');
              div.className = 'search-word';
              if (word != "") {
                div.innerHTML = \`
                  <input type="text" class="searchInput" placeholder="Enter search word" value="\${word}" />
                  <div class="color-box" style="background-color: \${color}"></div>
                \`;
              } else {
                div.innerHTML = \`
                  <input type="text" class="searchInput" placeholder="Enter search word" />
                  <div class="color-box" style="background-color: \${color}"></div>
                \`;
              }
              const searchInput = div.querySelector('.searchInput');
              const handleInput = (event) => {
                saveSettings_current();
              };
              searchInput.addEventListener('input', handleInput);

              container.appendChild(div);
            }

            function addGrepWord() {
              addGrepWord_load("");
            }

            function addSearchWord() {
              const container = document.getElementById('searchWordsContainer');
              const index = container.children.length;
              const color = colors[index % colors.length];
              addSearchWord_load("", color);
            }

            function deleteSetting() {
              const settingName = document.getElementById('settingList').value;
              delbuttun = document.getElementById('DelButtun');
              delbuttun.textContent = 'Deleting...';
              if (!settingName) {
                vscode.postMessage({ command: 'deleteSetting', name: '' });
                return;
              }
              vscode.postMessage({ command: 'deleteSetting', name: settingName });
            }

            function startGrep() {
              const grepWords = Array.from(document.getElementsByClassName('grepInput')).map(input => input.value).filter(word => word);
              const searchWords = Array.from(document.getElementsByClassName('searchInput')).map((input, index) => ({
                word: input.value,
                color: input.nextElementSibling.style.backgroundColor
              })).filter(item => item.word);
              mainbuttun = document.getElementById('MainButtun');
              mainbuttun.textContent = 'Processing...';

              vscode.postMessage({
                command: 'grep',
                grepWords,
                searchWords
              });
            }

            function saveSettings() {
              const settingName = document.getElementById('settingName').value;
              if (!settingName) return;
              const grepWords = Array.from(document.getElementsByClassName('grepInput')).map(input => input.value).filter(word => word);
              const searchWords = Array.from(document.getElementsByClassName('searchInput')).map(input => ({
                word: input.value,
                color: input.nextElementSibling.style.backgroundColor
              })).filter(item => item.word);
              vscode.postMessage({ command: 'saveSettings', name: settingName, grepWords, searchWords });
            }

            function loadSettings() {
              const settingName = document.getElementById('settingList').value;
              loadbuttun = document.getElementById('LoadButtun');
              loadbuttun.textContent = 'Loading...';
              loadbuttun.disabled = true;
              vscode.postMessage({ command: 'loadSettings', name: settingName });
              const input = document.getElementById('settingName');
              input.value = settingName;
            }

            function importSettings() {
                try {
                  const jsonInput = document.getElementById('importSettingsinput').value;

                  const json = JSON.parse(jsonInput);
                  const grepContainer = document.getElementById('grepContainer');
                  grepContainer.innerHTML = '';
                  json["Grep"].forEach(word => addGrepWord_load(word));

                  const searchContainer = document.getElementById('searchWordsContainer');
                  searchContainer.innerHTML = '';
                  json["Highlight"].forEach(item => addSearchWord_load(item.word, item.color));

                } catch (error) {
                }
            }

            function exportSettings() {
                try {
                  const grepWords = Array.from(document.getElementsByClassName('grepInput')).map(input => input.value).filter(word => word);
                  const searchWords = Array.from(document.getElementsByClassName('searchInput')).map((input, index) => ({
                    word: input.value,
                    color: input.nextElementSibling.style.backgroundColor
                  })).filter(item => item.word);
                  jsonObject = { "Grep": grepWords, "Highlight": searchWords };
                  const jsonOutput = document.getElementById('importSettingsinput');
                  jsonOutput.value = JSON.stringify(jsonObject);
                } catch (error) {
                }
            }

            // 受信ロジック
            window.addEventListener('message', event => {
              const message = event.data;
              if (message.command === 'loadSettings') {
                // Grepワードのフォームをクリアして更新
                const grepContainer = document.getElementById('grepContainer');
                grepContainer.innerHTML = '';
                message.grepWords.forEach(word => addGrepWord_load(word));

                // Searchワードのフォームをクリアして更新
                const searchContainer = document.getElementById('searchWordsContainer');
                searchContainer.innerHTML = '';
                message.searchWords.forEach(item => addSearchWord_load(item.word, item.color));

                loadbuttun = document.getElementById('LoadButtun');
                loadbuttun.textContent = 'Load';
                loadbuttun.disabled = false;
                saveSettings_current();

              } else if (message.command === 'updateSettingsList') {
                const settingList = document.getElementById('settingList');
                settingList.innerHTML = '';
                message.settings.forEach(setting => {
                  const option = document.createElement('option');
                  option.value = setting;
                  option.textContent = setting;
                  settingList.appendChild(option);
                });
                delbuttun = document.getElementById('DelButtun');
                delbuttun.textContent = 'Delete';
              } else if (message.command === 'Complete') {
                delbuttun = document.getElementById('DelButtun');
                delbuttun.textContent = 'Delete';
                mainbuttun = document.getElementById('MainButtun');
                mainbuttun.textContent = 'Grep & Highlight';
              } else if (message.command === 'requestState') {
                const grepWords = Array.from(document.getElementsByClassName('grepInput'))
                  .map(input => input.value)
                  .filter(word => word);
                const searchWords = Array.from(document.getElementsByClassName('searchInput'))
                  .map(input => ({
                    word: input.value,
                    color: input.nextElementSibling.style.backgroundColor
                  }))
                  .filter(item => item.word);
                vscode.postMessage({
                  command: 'sendState',
                  grepWords,
                  searchWords
                });
              }
            });

            function init() {
              addSearchWord();
            }
            init();
          </script>
        </body>
      </html>`;
  }
}

export function deactivate() {}
