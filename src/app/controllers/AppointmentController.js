import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns';

import Appointment from '../models/Appointment';
import File from '../models/File';
import User from '../models/User';
import Notification from '../schemas/Notification';
import CancellationJob from '../jobs/CancellationMail';
import Queue from '../../lib/Queue';

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;
    const appointments = await Appointment.findAll({
      where: {
        user_id: req.userId,
        canceled_at: null,
      },
      attributes: ['id', 'date', 'past', 'cancelable'],
      limit: 20,
      offset: (page - 1) * 20,
      order: ['date'],
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['id', 'path', 'url'],
            },
          ],
        },
      ],
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      date: Yup.date().required(),
      provider_id: Yup.number()
        .integer()
        .required(),
    });

    const { date, provider_id } = req.body;
    if (!(await schema.isValid({ date, provider_id }))) {
      return res.status(400).json({
        error: 'Validation failed',
      });
    }

    const provider = await User.findOne({
      where: {
        id: provider_id,
        provider: true,
      },
    });
    if (!provider) {
      return res.status(401).json({
        error: 'You can only schedule appointments with providers.',
      });
    }

    const hourStart = startOfHour(parseISO(date));
    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ error: 'Past dates are not allowed.' });
    }

    /*
     * Checks provider schedule to see if chosen time is available
     */
    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart,
      },
    });
    if (checkAvailability) {
      return res.status(400).json({ error: 'Date is not available.' });
    }

    /*
     * Saves provider notificaton on MongoDB
     */
    const user = await User.findByPk(req.userId);
    const formatedDate = format(hourStart, "MMMM do 'of' yyyy', at' h:mmb'");
    await Notification.create({
      content: `New appointment with ${user.name} scheduled on ${formatedDate}.`,
      user_id: provider_id,
    });

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date,
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['name'],
        },
      ],
    });

    if (appointment.user_id !== req.userId) {
      return res
        .status(401)
        .json({ error: 'You can only cancel your own appointments.' });
    }
    const maxCancelDate = subHours(appointment.date, 2);
    if (isBefore(maxCancelDate, new Date())) {
      return res.status(401).json({
        error:
          'You can only cancel an appointment 2 hours prior to its schedule.',
      });
    }

    appointment.canceled_at = new Date();
    await appointment.save();
    await Queue.add(CancellationJob.key, { appointment });
    return res.json(appointment);
  }
}

export default new AppointmentController();
