#!/usr/bin/env node
import net from 'node:net';
import fs from 'node:fs';

/**
 * A throwaway SMTP server that accepts everything and writes what it
 * received to a file.
 *
 * Exists so the mail path can be tested for real — nodemailer's SMTP
 * client, STARTTLS negotiation being skipped, AUTH, the envelope, the
 * MIME body — rather than only the console fallback, which proves nothing
 * about whether a message would actually send.
 *
 *   node test/smtp-sink.js [port] [outfile]
 */

const PORT = Number(process.argv[2] ?? 2525);
const OUT = process.argv[3] ?? '/tmp/smtp-sink.log';

fs.writeFileSync(OUT, '');

const server = net.createServer((socket) => {
  let inData = false;
  let buffer = '';

  socket.write('220 smtp-sink ESMTP ready\r\n');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    while (true) {
      if (inData) {
        // The message body ends at a lone dot on its own line.
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;

        fs.appendFileSync(OUT, `${buffer.slice(0, end)}\n===MESSAGE-END===\n`);
        buffer = buffer.slice(end + 5);
        inData = false;
        socket.write('250 2.0.0 Ok: queued\r\n');
        continue;
      }

      const lineEnd = buffer.indexOf('\r\n');
      if (lineEnd === -1) return;

      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);
      const verb = line.split(' ')[0].toUpperCase();

      if (verb === 'EHLO' || verb === 'HELO') {
        // No STARTTLS and no AUTH advertised, so nodemailer sends in the
        // clear and skips authentication — which is what we want from a
        // local sink.
        socket.write('250-smtp-sink\r\n250 8BITMIME\r\n');
      } else if (verb === 'MAIL' || verb === 'RCPT') {
        fs.appendFileSync(OUT, `${line}\n`);
        socket.write('250 2.1.0 Ok\r\n');
      } else if (verb === 'DATA') {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (verb === 'QUIT') {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
        return;
      } else if (verb === 'RSET' || verb === 'NOOP') {
        socket.write('250 2.0.0 Ok\r\n');
      } else {
        socket.write('250 2.0.0 Ok\r\n');
      }
    }
  });

  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`smtp-sink listening on 127.0.0.1:${PORT}, writing to ${OUT}`);
});
