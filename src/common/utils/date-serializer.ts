/**
 * Configura a serialização padrão de instâncias de Date para JSON (JSON.stringify).
 * Em vez de sempre emitir em UTC com sufixo 'Z' (ex.: 22:11:38Z),
 * serializa com o deslocamento do fuso horário explícito (ex.: 19:11:38.240-03:00).
 *
 * Isso mantém 100% de compatibilidade com o padrão ISO 8601 e permite que qualquer
 * desenvolvedor ou usuário veja o horário local diretamente no Swagger e nos payloads JSON,
 * ao mesmo tempo em que qualquer frontend no mundo continua conseguindo converter a data perfeitamente.
 */
export function configureDateSerialization(
  timeZone = process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
): void {
  Date.prototype.toJSON = function (this: Date): string {
    if (isNaN(this.getTime())) {
      return this.toISOString();
    }

    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'longOffset',
    })
      .formatToParts(this)
      .forEach((item) => {
        parts[item.type] = item.value;
      });

    const ms = String(this.getMilliseconds()).padStart(3, '0');
    const offset = parts.timeZoneName
      ? parts.timeZoneName.replace('GMT', '')
      : 'Z';
    const hour = parts.hour === '24' ? '00' : parts.hour;

    return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}.${ms}${offset}`;
  };
}
