import {
  startOfDay,
  endOfDay,
  setHours,
  setMinutes,
  setSeconds,
  format,
  isAfter,
} from 'date-fns';
import Sequelize from 'sequelize';
import Appointment from '../models/Appointment';

class AvailabilityController {
  async index(req, res) {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date not found.' });
    }
    const searchDate = Number(date);

    const appointments = await Appointment.findAll({
      where: {
        provider_id: req.params.providerId,
        canceled_at: null,
        date: {
          [Sequelize.Op.between]: [
            startOfDay(searchDate),
            endOfDay(searchDate),
          ],
        },
      },
    });

    const schedule = [
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ];
    const availability = schedule.map(time => {
      const [hours, minutes] = time.split(':');
      const available = setSeconds(
        setMinutes(setHours(searchDate, hours), minutes),
        0
      );

      return {
        time,
        value: format(available, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        available:
          isAfter(available, new Date()) &&
          !appointments.find(
            appointment => format(appointment.date, 'HH:mm') === time
          ),
      };
    });

    return res.json(availability);
  }
}

export default new AvailabilityController();
