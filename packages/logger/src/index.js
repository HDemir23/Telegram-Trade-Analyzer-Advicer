"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("@trade/config");
const createLogger = (name) => {
    return (0, pino_1.default)({
        name: name || 'trade-bot',
        level: config_1.env.LOG_LEVEL,
        transport: config_1.env.NODE_ENV === 'development' ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname'
            }
        } : undefined
    });
};
exports.createLogger = createLogger;
exports.logger = createLogger();
