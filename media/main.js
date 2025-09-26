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

    function createInputLine(index, value = '', not = false) {
        const container = document.createElement('div');
        container.className = 'grep-input-line';
    
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.className = 'grep-pattern';
        input.dataset.not = not;
    
        const notToggle = document.createElement('button');
        notToggle.textContent = not ? 'NOT' : ' ';
        notToggle.className = 'not-toggle';
        notToggle.onclick = () => {
            const isNot = notToggle.textContent === 'NOT';
            notToggle.textContent = isNot ? ' ' : 'NOT';
            input.dataset.not = !isNot;
        };
    
        container.appendChild(input);
        container.appendChild(notToggle);
    
        return container;
    }

    function getPatterns() {
        const lines = document.querySelectorAll('.grep-input-line');
        return Array.from(lines).map(line => {
            const input = line.querySelector('.grep-pattern');
            return {
                pattern: input.value,
                not: input.dataset.not === 'true'
            };
        });
    }

    function buildGrepCommand(patterns) {
        let cmd = 'cat <file>'; // Replace <file> as needed
        patterns.forEach(p => {
            if (p.pattern.trim()) {
                cmd += ` | grep ${p.not ? '-v ' : ''}"${p.pattern.replace(/"/g, '\\"')}"`;
            }
        });
        return cmd;
    }
  })();