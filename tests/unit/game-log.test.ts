import {
  GAME_LOG_MIN_DATE,
  GAME_LOG_STATUSES,
  PLAYTIME_MINUTES_MAX,
  defaultGameLogOrder,
  formatGameLogDate,
  formatPlaytime,
  gameLogDateSchema,
  gameLogEntryInputSchema,
  gameLogEntryUpdateSchema,
  gameLogQuerySchema,
  hoursToMinutes,
  isGameLogDateInRange,
  minutesToHoursInput,
  todayIsoDate,
} from '@gamelog/shared';
import { describe, expect, it } from 'vitest';

/** Primeiro campo com erro em um resultado de `safeParse` (helpers da F8). */
function errorPath(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues[0]?.path.join('.');
}

describe('helpers e schemas do diário (CA-F8-16)', () => {
  describe('datas', () => {
    it('aceita datas reais no formato YYYY-MM-DD dentro da faixa permitida', () => {
      expect(gameLogDateSchema.safeParse('2024-02-03').success).toBe(true);
      expect(gameLogDateSchema.safeParse(GAME_LOG_MIN_DATE).success).toBe(true);
      expect(gameLogDateSchema.safeParse(todayIsoDate()).success).toBe(true);
    });

    it('recusa formato inválido, datas inexistentes e datas fora da faixa', () => {
      expect(gameLogDateSchema.safeParse('03/02/2024').success).toBe(false);
      expect(gameLogDateSchema.safeParse('2024-2-3').success).toBe(false);
      expect(gameLogDateSchema.safeParse('2024-02-31').success).toBe(false);
      expect(gameLogDateSchema.safeParse('1949-12-31').success).toBe(false);

      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      expect(gameLogDateSchema.safeParse(tomorrow.toISOString().slice(0, 10)).success).toBe(false);
    });

    it('isGameLogDateInRange usa o dia atual (UTC) como limite superior', () => {
      expect(isGameLogDateInRange('1950-01-01', '2024-02-03')).toBe(true);
      expect(isGameLogDateInRange('2024-02-03', '2024-02-03')).toBe(true);
      expect(isGameLogDateInRange('2024-02-04', '2024-02-03')).toBe(false);
      expect(isGameLogDateInRange('1949-12-31', '2024-02-03')).toBe(false);
    });

    it('exibe a data em pt-BR no fuso UTC', () => {
      expect(formatGameLogDate('2024-02-03')).toBe('03/02/2024');
      expect(formatGameLogDate('1950-01-01')).toBe('01/01/1950');
    });
  });

  describe('ordem início ↔ fim', () => {
    it('aceita datas ausentes, nulas ou em ordem crescente', () => {
      expect(gameLogEntryInputSchema.safeParse({ status: 'PLAYING' }).success).toBe(true);
      expect(
        gameLogEntryInputSchema.safeParse({
          status: 'PLAYING',
          startedAt: null,
          finishedAt: null,
        }).success,
      ).toBe(true);
      expect(
        gameLogEntryInputSchema.safeParse({
          status: 'COMPLETED',
          startedAt: '2024-01-10',
          finishedAt: '2024-02-03',
        }).success,
      ).toBe(true);
      expect(
        gameLogEntryInputSchema.safeParse({
          status: 'COMPLETED',
          startedAt: '2024-01-10',
          finishedAt: '2024-01-10',
        }).success,
      ).toBe(true);
    });

    it('recusa finishedAt anterior a startedAt apontando o campo finishedAt', () => {
      const result = gameLogEntryInputSchema.safeParse({
        status: 'COMPLETED',
        startedAt: '2024-02-03',
        finishedAt: '2024-01-10',
      });

      expect(result.success).toBe(false);
      expect(errorPath(result)).toBe('finishedAt');
    });

    it('normaliza campos opcionais omitidos como undefined (o PUT grava null)', () => {
      const result = gameLogEntryInputSchema.parse({ status: 'BACKLOG' });

      expect(result.startedAt).toBeUndefined();
      expect(result.finishedAt).toBeUndefined();
      expect(result.playtimeMinutes).toBeUndefined();
      expect(result.platformId).toBeUndefined();
    });
  });

  describe('edição parcial', () => {
    it('aceita qualquer subconjunto de campos', () => {
      expect(gameLogEntryUpdateSchema.safeParse({ status: 'PLAYING' }).success).toBe(true);
      expect(gameLogEntryUpdateSchema.safeParse({ playtimeMinutes: null }).success).toBe(true);
      expect(gameLogEntryUpdateSchema.safeParse({ platformId: null }).success).toBe(true);
      expect(
        gameLogEntryUpdateSchema.safeParse({ startedAt: null, finishedAt: '2024-02-03' }).success,
      ).toBe(true);
    });

    it('recusa corpo vazio, status nulo e campos desconhecidos', () => {
      expect(gameLogEntryUpdateSchema.safeParse({}).success).toBe(false);
      expect(gameLogEntryUpdateSchema.safeParse({ status: null }).success).toBe(false);
      expect(gameLogEntryUpdateSchema.safeParse({ status: 'PLAYING', extra: 1 }).success).toBe(
        false,
      );
    });

    it('recusa combinações inválidas mesmo em edição parcial', () => {
      const result = gameLogEntryUpdateSchema.safeParse({
        startedAt: '2024-03-01',
        finishedAt: '2024-02-03',
      });

      expect(result.success).toBe(false);
      expect(errorPath(result)).toBe('finishedAt');
    });
  });

  describe('limites de tempo', () => {
    it('aceita 0 e o máximo, e null na edição parcial', () => {
      expect(
        gameLogEntryInputSchema.safeParse({ status: 'PLAYING', playtimeMinutes: 0 }).success,
      ).toBe(true);
      expect(
        gameLogEntryInputSchema.safeParse({
          status: 'PLAYING',
          playtimeMinutes: PLAYTIME_MINUTES_MAX,
        }).success,
      ).toBe(true);
      expect(
        gameLogEntryInputSchema.safeParse({ status: 'PLAYING', playtimeMinutes: null }).success,
      ).toBe(true);
    });

    it('recusa valores negativos, acima do máximo e não inteiros', () => {
      for (const playtimeMinutes of [-1, PLAYTIME_MINUTES_MAX + 1, 90.5]) {
        const result = gameLogEntryInputSchema.safeParse({ status: 'PLAYING', playtimeMinutes });
        expect(result.success).toBe(false);
        expect(errorPath(result)).toBe('playtimeMinutes');
      }
    });
  });

  describe('conversão horas → minutos', () => {
    it('converte decimais com vírgula ou ponto', () => {
      expect(hoursToMinutes('12,5')).toBe(750);
      expect(hoursToMinutes('12.5')).toBe(750);
      expect(hoursToMinutes('0,5')).toBe(30);
      expect(hoursToMinutes('3')).toBe(180);
      expect(hoursToMinutes(' 1,25 ')).toBe(75);
      expect(hoursToMinutes('0')).toBe(0);
    });

    it('recusa entradas vazias ou não numéricas', () => {
      expect(hoursToMinutes('')).toBeNull();
      expect(hoursToMinutes('   ')).toBeNull();
      expect(hoursToMinutes('abc')).toBeNull();
      expect(hoursToMinutes('-1')).toBeNull();
      expect(hoursToMinutes('1,2,3')).toBeNull();
    });
  });

  describe('formatação do tempo jogado', () => {
    it('exibe horas e minutos no formato pt-BR', () => {
      expect(formatPlaytime(750)).toBe('12h 30min');
      expect(formatPlaytime(45)).toBe('45min');
      expect(formatPlaytime(1350)).toBe('22h 30min');
      expect(formatPlaytime(90)).toBe('1h 30min');
      expect(formatPlaytime(60)).toBe('1h');
      expect(formatPlaytime(0)).toBe('0min');
    });

    it('converte minutos de volta para o campo em horas', () => {
      expect(minutesToHoursInput(750)).toBe('12,5');
      expect(minutesToHoursInput(45)).toBe('0,75');
      expect(minutesToHoursInput(60)).toBe('1');
      expect(minutesToHoursInput(0)).toBe('0');
      expect(hoursToMinutes(minutesToHoursInput(1350))).toBe(1350);
    });
  });

  describe('listagem', () => {
    it('normaliza o filtro status (repetível e sem diferenciar caixa)', () => {
      const parsed = gameLogQuerySchema.parse({ status: ['playing', 'Dropped'] });
      expect(parsed.status).toEqual(['PLAYING', 'DROPPED']);

      expect(gameLogQuerySchema.parse({ status: 'completed' }).status).toBe('COMPLETED');
      expect(gameLogQuerySchema.safeParse({ status: 'zerado' }).success).toBe(false);
    });

    it('valida ordenação e paginação', () => {
      expect(gameLogQuerySchema.safeParse({ sort: 'recently_updated' }).success).toBe(true);
      expect(gameLogQuerySchema.safeParse({ sort: 'recent' }).success).toBe(false);
      expect(gameLogQuerySchema.safeParse({ order: 'asc' }).success).toBe(true);
      expect(gameLogQuerySchema.safeParse({ order: 'sideways' }).success).toBe(false);
      expect(gameLogQuerySchema.safeParse({ page: 0 }).success).toBe(false);
      expect(gameLogQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false);
      expect(gameLogQuerySchema.parse({ page: '2', pageSize: '5' })).toMatchObject({
        page: 2,
        pageSize: 5,
      });
    });

    it('a direção padrão é descendente, exceto em title', () => {
      expect(defaultGameLogOrder('recently_updated')).toBe('desc');
      expect(defaultGameLogOrder('recently_added')).toBe('desc');
      expect(defaultGameLogOrder('title')).toBe('asc');
    });

    it('os rótulos pt-BR cobrem todos os status', () => {
      expect(GAME_LOG_STATUSES).toHaveLength(5);
    });
  });
});
