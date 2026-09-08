const ENV_VAR = 'PORTFOLIO_PASSPHRASE';

// Compared by code point rather than by literal, so no control characters live in this file.
const LF = 10;
const CR = 13;
const CTRL_C = 3;
const CTRL_D = 4;
const BACKSPACE = 8;
const DELETE = 127;
const ESCAPE = 27;
const SPACE = 32;

/**
 * Turns raw terminal keystrokes into a passphrase.
 *
 * Kept separate from the terminal plumbing so the key handling is unit-testable:
 * feed it chunks, get back what to echo and whether the user is done.
 *
 * @returns {(chunk: string) => {status: 'pending'|'done'|'cancelled', value: string, echo: string}}
 */
export function createSecretReader() {
  let value = '';

  return function read(chunk) {
    let echo = '';

    for (const ch of chunk) {
      const code = ch.codePointAt(0);

      if (code === CR || code === LF) return { status: 'done', value, echo };
      if (code === CTRL_C) return { status: 'cancelled', value: '', echo };
      if (code === CTRL_D) {
        return value.length > 0
          ? { status: 'done', value, echo }
          : { status: 'cancelled', value: '', echo };
      }

      if (code === DELETE || code === BACKSPACE) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          echo += '\b \b'; // rub out one asterisk
        }
        continue;
      }

      // Arrow keys and friends arrive as escape sequences; drop the rest of the chunk
      // rather than letting "[A" land in the passphrase.
      if (code === ESCAPE) break;

      if (code < SPACE) continue; // any other control character
      value += ch;
      echo += '*';
    }

    return { status: 'pending', value, echo };
  };
}

/**
 * Reads a line from the terminal, echoing one '*' per character.
 *
 * Deliberately does not use readline: in terminal mode it redraws the input line on every
 * keypress, and that redraw erases the prompt label — which looks exactly like a hung process.
 */
function promptSecret(label) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    const read = createSecretReader();

    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const settle = (fn, arg) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      fn(arg);
    };

    function onData(chunk) {
      const { status, value, echo } = read(chunk);
      if (echo) stdout.write(echo);

      if (status === 'done') settle(resolve, value);
      else if (status === 'cancelled') settle(reject, new Error('Cancelled.'));
    }

    stdin.on('data', onData);
  });
}

/**
 * @param {boolean} confirm ask twice — used when the passphrase is being set, since a
 *   typo there locks the portfolio for good.
 */
export async function getPassphrase({ confirm = false } = {}) {
  const fromEnv = process.env[ENV_VAR];
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    throw new Error(
      `No terminal to prompt on. Run the server from a terminal, or set ${ENV_VAR} ` +
        '(which keeps the key on disk and weakens the protection).',
    );
  }

  const passphrase = await promptSecret('Passphrase: ');
  if (passphrase.length === 0) throw new Error('Passphrase cannot be empty.');

  if (confirm) {
    const again = await promptSecret('Confirm passphrase: ');
    if (again !== passphrase) throw new Error('The two passphrases did not match.');
  }

  return passphrase;
}
