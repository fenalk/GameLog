import { z } from 'zod';

/**
 * Mensagens padrão do Zod em pt-BR (seção 2 da SPEC F1: mensagens ao usuário em
 * português). Vale para o backend e o frontend, que compartilham estes schemas;
 * mensagens customizadas nos schemas continuam tendo precedência.
 */
z.config(z.locales.ptBR());
