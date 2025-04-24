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
    const lastState = this.context.workspaceState.get<{ grepWords: string[], searchWords: { word: string; color: string }[], settingName: string }>('lastState');
    if (lastState) {
      webviewView.webview.postMessage({
        command: 'loadSettings',
        grepWords: lastState.grepWords,
        searchWords: lastState.searchWords,
        settingName: lastState.settingName
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
        this.saveStateFromWebview(message.grepWords, message.searchWords, message.settingName, webviewView.webview);
      }
      webviewView.webview.postMessage({ command: 'Complete' });
    });
  }

  // state を保存するメソッド
  private async saveStateFromWebview(grepWords: string[], searchWords: { word: string; color: string }[], settingName: string, webview: vscode.Webview) {
    const response = {grepWords: grepWords, searchWords: searchWords, settingName: settingName};
    if (response) {
      this.context.workspaceState.update('lastState', response);
      console.log('State saved:', response);
    }
  }

  private async restoreState(webview: vscode.Webview) {
    const state = this.context.workspaceState.get<{ grepWords: string[], searchWords: { word: string; color: string }[], settingName: string}>('lastState');
    if (state) {
      webview.postMessage({ command: 'loadSettings', grepWords: state.grepWords, searchWords: state.searchWords, settingName: state.settingName });
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
        //results.push(`${String(line + 1).padStart(8, ' ')}: ${text}`);
        results.push(`${text}`);
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
        // const regex = new RegExp(`(${word})`, 'gi');
        line = line.replace(word, `<span style="background-color: ${color}; font-weight: bold;">${word}</span>`);
      });
      line = `<div class="log-line">${line}</div>`;
      return line;
    }).join('');

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

            .container {
                width: 100%; /* 親要素にフィット */
                font-family: monospace;
                white-space: pre; /* 折り返し無効 */
                overflow-x: auto; /* 横スクロール有効 */
                overflow-y: hidden;
                box-sizing: border-box;
            }

            .log-line {
              display: flex;
              align-items: center;
              padding: 1px 0px;
              cursor: text;
            }

            .log-line.selected {
              background-color: #cce5ff;
            }

            .log-text {
              margin-left: 8px;
              white-space: pre;
              flex: 1;
            }

            /* 折り返し有効時のスタイル */
            .wrap {
                white-space: pre-wrap; /* 折り返しを有効化 */
                overflow-x: hidden; /* 横スクロールを無効化 */
                overflow-y: auto;
            }

            /* チェックボックスをスクロールしても上部に固定 */
            .sticky {
                position: sticky;
                top: 0;
                padding: 0px;
                border-bottom: 1px solid var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                z-index: 10;
            }
          </style>
        </head>
        <body>
          <div class="sticky">
            <button onclick="resizeText(2)">Zoom In</button>
            <button onclick="resizeText(-2)">Zoom Out</button>
            <label>
                <input type="checkbox" id="wrapToggle" />
                Enable wrap
            </label>
            <label>
                <input type="checkbox" id="trimToggle" />
                Trim mode
            </label>
            <button onclick="deleteSelected()" id="removelinebuttun" disabled=true>Remove lines</button>
            <!--
            <input type="text" id="searchBox" placeholder="Search.." />
            <button id="searchButton">Search</button>
            <button id="prevButton">▲</button>
            <button id="nextButton">▼</button> -->

            <!-- <input type="text" id="debuglog" placeholder="" /> -->
          </div>
          <div id="textContainer" class="container">${highlightedResults}</div>
          <script>
              function printdebuglog(log) {
                  const textElement = document.getElementById('debuglog');
                  if (textElement) {textElement.value = String(log);}
              }

              function resizeText(step) {
                  const textElement = document.getElementById('textContainer');
                  let currentSize = parseFloat(window.getComputedStyle(textElement).fontSize);
                  let newSize = currentSize + step;

                  // 最小フォントサイズを制限（オプション）
                  if (newSize < 10) newSize = 10;

                  // 最大フォントサイズを制限（オプション）
                  if (newSize > 40) newSize = 40;

                  textElement.style.fontSize = \`\${newSize}px\`;
              };
              document.getElementById('wrapToggle').addEventListener('change', function(event) {
                  const container = document.getElementById('textContainer');
                  if (event.target.checked) {
                      container.classList.add('wrap');
                  } else {
                      container.classList.remove('wrap');
                  }
              });

              const logContainer = document.getElementById("textContainer");
              let lastClicked = null;
              let trimEnabled = false;

              document.getElementById('trimToggle').addEventListener('change', function(event) {
                const removelinebuttun = document.getElementById('removelinebuttun');
                if (event.target.checked) {
                    trimEnabled = true;
                    removelinebuttun.disabled = false;
                    const logContainer = document.getElementById("textContainer");
                    logContainer.style.userSelect = "none";
                    logContainer.style.cursor = "pointer";
                } else {
                    trimEnabled = false;
                    removelinebuttun.disabled = true;
                    const selected = document.querySelectorAll(".log-line.selected");
                    selected.forEach(line => {
                      line.classList.remove("selected");
                    });
                    lastClicked = null;
                    const logContainer = document.getElementById("textContainer");
                    logContainer.style.userSelect = "auto";
                    logContainer.style.cursor = "auto";
                }
              });

              logContainer.addEventListener("click", (e) => {
                if (trimEnabled) {
                  const line = e.target.closest(".log-line");
                  if (!line || e.target.tagName === 'INPUT') return;

                  const lines = Array.from(logContainer.children);
                  const clickedIndex = lines.indexOf(line);

                  if (e.shiftKey && lastClicked !== null) {
                    const lastIndex = lines.indexOf(lastClicked);
                    const [start, end] = [clickedIndex, lastIndex].sort((a, b) => a - b);
                    for (let i = start; i <= end; i++) {
                      selectLine(lines[i], true);
                    }
                  } else {
                    const isSelected = line.classList.contains("selected");
                    selectLine(line, !isSelected);
                  }
                  lastClicked = line;
                }
              });

              function selectLine(line, selected) {
                line.classList.toggle("selected", selected);
              }

              function deleteSelected() {
                const selected = document.querySelectorAll(".log-line.selected");
                selected.forEach(line => line.remove());
                lastClicked = null;
              }

              // 検索実行
              function searchText() {
                  const container = document.getElementById('textContainer');
                  const searchText = document.getElementById('searchBox').value;
                  if (!searchText) return;

                  // 既存のハイライトをクリア
                  container.innerHTML = container.innerHTML.replace(/<pre class="highlight">(.*)<\\/pre>/g, '$1');

                  searchResults = [];
                  searchIndex = 0;

                  // 検索してマッチ箇所をハイライト
                  const regex = new RegExp(\`(\${searchText})\`, 'gi');
                  container.innerHTML = container.innerHTML.replace(regex, (match) => {
                      searchResults.push(match);
                      return \`<pre class="highlight">\${match}</pre>\`;
                  });

                  if (searchResults.length > 0) {
                      jumpToResult(0); // 最初の検索結果にジャンプ
                  }
              }

              // ジャンプ処理
              function jumpToResult(index) {
                  const highlights = document.querySelectorAll('.highlight');
                  if (highlights.length === 0) return;

                  // すべてのハイライトの強調解除
                  highlights.forEach((el) => el.classList.remove('active-highlight'));

                  if (index < 0) index = highlights.length - 1;
                  if (index >= highlights.length) index = 0;

                  searchIndex = index;
                  const target = highlights[searchIndex];

                  // アクティブな検索結果を強調
                  target.classList.add('active-highlight');
                  target.scrollIntoView();
              }

              // 次へボタン
              document.getElementById('nextButton').addEventListener('click', () => {
                  if (searchResults.length > 0) {
                      jumpToResult(searchIndex + 1);
                  }
              });

              // 前へボタン
              document.getElementById('prevButton').addEventListener('click', () => {
                  if (searchResults.length > 0) {
                      jumpToResult(searchIndex - 1);
                  }
              });

              // 検索ボタンクリック or Enterで検索実行
              document.getElementById('searchButton').addEventListener('click', searchText);
              document.getElementById('searchBox').addEventListener('keydown', (event) => {
                  if (event.key === 'Enter') {
                      searchText();
                  }
              });
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
      webview.postMessage({ command: 'loadSettings', grepWords: config[name].grepWords, searchWords: config[name].searchWords, settingName: name });
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
    const lightColors = "['none', 'lightyellow', 'khaki', 'gold', 'lightsalmon', 'salmon', 'lightcoral', 'pink', 'hotpink', 'lightgreen', 'lime', 'aquamarine', 'skyblue', 'dodgerblue', 'fuchsia']";
    const darkColors = "['none', 'dimgray', 'slategray', 'darkolivegreen', 'olive', 'darkgreen', 'seagreen', 'teal', 'cadetblue', 'navy', 'indigo', 'purple', 'darkred', 'firebrick',  'chocolate', 'sienna', 'darkgoldenrod']";
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

            #colorList:focus {
                background-color: inherit; /* 選択中の背景色を変えない */
                color: inherit;
            }
            #colorList option:focus {
                background-color: inherit; /* ドロップダウンの背景色 */
                color: black; /* 文字色 */
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
          <div class="button">
            <!-- <button-sub onclick="addSearchWord()">+</button> -->
            <select id="colorList"></select>
          </div>
          <div class="center-button">
            <button-main onclick="startGrep()" id="MainButtun">Grep & Highlight</button>
          </div>
          <div class="center-button">
            <button onclick="clearAll()" id="ClearButtun">Clear All</button>
            <button onclick="clearBrank()" id="ClearButtun">Clear Brank</button>
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
              const settingName = document.getElementById('settingName').value;
              vscode.postMessage({ command: 'saveSettings_current', grepWords, searchWords, settingName });
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

            function clearAll() {
              const grepContainer = document.getElementById('grepContainer');
              grepContainer.innerHTML = '';
              const searchContainer = document.getElementById('searchWordsContainer');
              searchContainer.innerHTML = '';
            }

            function clearBrank() {
              const grepWords = Array.from(document.getElementsByClassName('grepInput')).map(input => input.value).filter(word => word);
              const searchWords = Array.from(document.getElementsByClassName('searchInput')).map((input, index) => ({
                word: input.value,
                color: input.nextElementSibling.style.backgroundColor
              })).filter(item => item.word);
              const grepContainer = document.getElementById('grepContainer');
              grepContainer.innerHTML = '';
              const searchContainer = document.getElementById('searchWordsContainer');
              searchContainer.innerHTML = '';

              grepWords.forEach(word => addGrepWord_load(word));
              searchWords.forEach(item => addSearchWord_load(item.word, item.color));
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

                const settingName = document.getElementById('settingName');
                settingName.value = message.settingName;

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

            function addColorOptions() {
              const colorselect = document.getElementById("colorList");
              // 色のリストを <select> に追加
              colors.forEach(color => {
                  const option = document.createElement("option");
                  option.value = color;
                  option.textContent = color;
                  if (color === "none") {
                    option.textContent = "Select color";
                    option.style.color = "black";
                    option.style.backgroundColor = "white";
                  } else {
                    option.style.color = color;
                    option.style.backgroundColor = color;
                  }
                  colorselect.appendChild(option);
              });

              // プルダウン選択時にも色を変更
              colorselect.addEventListener("change", function(){
                var index = this.selectedIndex;
                addSearchWord_load("", colors[ index ]);
                this.style.backgroundColor = colors[ index ];
                this.value = colors[0];
              });
              colorselect.style.backgroundColor = "black";
              colorselect.style.color = "white";
            }

            function init() {
              addSearchWord();
              addColorOptions();
            }
            init();
          </script>
        </body>
      </html>`;
  }
}

export function deactivate() {}
