(function () {
    const vscode = acquireVsCodeApi();

    const wordInput = document.getElementById('wordInput');
    const grepButton = document.getElementById('grepButton');

    grepButton.addEventListener('click', () => {
      const words = wordInput.value.split(' ');
      vscode.postMessage({
        type: 'grep',
        words: words
      });
    });
  })();