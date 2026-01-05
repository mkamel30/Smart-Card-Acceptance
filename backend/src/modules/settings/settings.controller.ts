import { Request, Response, NextFunction } from 'express';
import settingsService from './settings.service';

export class SettingsController {
    async get(req: Request, res: Response, next: NextFunction) {
        try {
            const settings = await settingsService.getSettings();
            res.json(settings);
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const settings = await settingsService.updateSettings(req.body);
            res.json(settings);
        } catch (error) {
            next(error);
        }
    }
}

export default new SettingsController();
