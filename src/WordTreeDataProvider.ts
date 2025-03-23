import * as vscode from 'vscode';

// ツリービューに表示するアイテムのクラス
class WordItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}

// TreeDataProvider の実装
export class WordTreeDataProvider implements vscode.TreeDataProvider<WordItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WordItem | undefined | null> = new vscode.EventEmitter<WordItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<WordItem | undefined | null> = this._onDidChangeTreeData.event;

    private words: string[] = [];

    // ツリービューに表示するデータを返す
    getTreeItem(element: WordItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    // ツリービューの子要素を返す
    getChildren(element?: WordItem): vscode.ProviderResult<WordItem[]> {
        if (element) {
            return []; // 子要素がない場合は空配列を返す
        } else {
            return this.words.map(word => new WordItem(word, vscode.TreeItemCollapsibleState.None, {
                command: 'extension.highlightWord',
                title: 'Highlight Word',
                arguments: [word]
            }));
        }
    }

    // 単語を追加するメソッド
    addWord(word: string) {
        this.words.push(word);
        this._onDidChangeTreeData.fire(undefined); // ツリービューを更新
    }
}