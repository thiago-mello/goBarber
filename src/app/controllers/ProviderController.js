import User from '../models/User';
import File from '../models/File';

class ProviderController {
  async index(req, res) {
    const providers = await User.findAll({
      where: { provider: true },
      attributes: ['id', 'name', 'avatar_id'],
      include: {
        model: File,
        attributes: ['id', 'name', 'path', 'url'],
        as: 'avatar',
      },
    });

    return res.json(providers);
  }
}

export default new ProviderController();
