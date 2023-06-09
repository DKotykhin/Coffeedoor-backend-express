import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

import UserModel from "../models/UserModel.js";
import OrderModel from '../models/OrderModel.js';
import ApiError from '../error/apiError.js';
import { findUserById } from '../utils/findUserById.js';
import { mailConfig } from '../utils/mailConfig.js';

const generateToken = (_id) => {
    return jwt.sign(
        { _id },
        process.env.SECRET_KEY,
        { expiresIn: "2d" }
    )
};
const createPasswordHash = async (password) => {
    const salt = await bcrypt.genSalt(5);
    const passwordHash = await bcrypt.hash(password, salt);
    return passwordHash;
};

class UserService {

    async loginByToken(id) {
        const user = await findUserById(id);

        return user;
    }

    async rawRegister(data) {
        const { phone, userName, address } = data;
        const user = await UserModel.findOne({ phone });
        if (user) {
            return user;
        } else {
            const user = await UserModel.create({
                userName,
                phone,
                address,
            });
            if (!user) {
                throw ApiError.internalError('Server error! Try again')
            }
            return user;
        }
    }

    async fullRegister(data) {
        const { phone, userName, password } = data;
        if (phone) {
            const candidat = await UserModel.findOne({ phone });
            if (candidat) {
                throw ApiError.badRequest(`User with ${phone} phone already exist. Please login`)
            }
        };

        const passwordHash = await createPasswordHash(password);
        const user = await UserModel.create({
            userName,
            phone,
            passwordHash,
        });
        if (!user) {
            throw ApiError.internalError('Server error! Try again')
        };
        const token = generateToken(user._id);

        return { user, token };
    }

    async login(data) {
        const { phone, password } = data;
        const user = await UserModel.findOne({ phone });
        if (!user) {
            throw ApiError.notFound("Can't find user")
        }

        let isValidPass;
        if (user.passwordHash) {
            isValidPass = await bcrypt.compare(password, user.passwordHash)
        } else return {
            user,
            message: "You don't have password yet. Please, set the new one"
        }
        if (!isValidPass) {
            throw ApiError.badRequest('Incorrect login or password')
        }
        const token = generateToken(user._id);

        return {
            user,
            token,
            message: `User ${user.userName} successfully logged`
        };
    }

    async setPassword(data) {
        const { userId, password } = data;

        const user = await findUserById(userId);

        if (user.passwordHash) {
            throw ApiError.forbidden("You have password yet. Please login")
        }

        const passwordHash = await createPasswordHash(password);
        const updatedUser = await UserModel.findOneAndUpdate(
            { _id: user._id },
            { passwordHash },
            { returnDocument: 'after' },
        );
        if (!updatedUser) {
            throw ApiError.forbidden("Modified forbidden")
        }

        return {
            user: updatedUser,
            message: 'Password successfully setted'
        };
    }

    async resetPassword(email) {
        const user = await UserModel.findOne({ email });
        if (!user) {
            throw ApiError.notFound("Can't find user with this email")
        };

        const buffer = crypto.randomBytes(16);
        if (!buffer) {
            throw ApiError.internalError("Something get wrong. Try again")
        };
        const token = buffer.toString('hex');

        const updatedUser = await UserModel.findOneAndUpdate(
            { email },
            {
                'reset.token': token,
                'reset.expire': Date.now() + (3600 * 1000)
            },
            { returnDocument: 'after' },
        );
        if (!updatedUser) {
            throw ApiError.forbidden("Modified forbidden")
        }

        return mailConfig(token, email)
            .then((status) => {
                return {
                    status: status.response,
                    message: `Email successfully sent to ${status.accepted}`,
                };
            })
            .catch((err) => {
                throw ApiError.invalidValue(
                    err.message || "Can't send mail");
            });
    }

    async setNewPassword(body) {
        const { token, password } = body;
        const passwordHash = await createPasswordHash(password);
        const updatedUser = await UserModel.findOneAndUpdate(
            { 'reset.token': token, 'reset.expire': { $gt: Date.now() } },
            {
                $set: {
                    passwordHash,
                    'resetPassword.token': null,
                    'resetPassword.expire': null,
                    'resetPassword.modified': Date.now(),
                }
            },
            { returnDocument: 'after' },
        );
        if (!updatedUser) {
            throw ApiError.forbidden("Modified forbidden")
        } else return {
            status: true,
            message: 'New password successfully setted'
        }
    }

    async confirmPassword(password, id) {
        const user = await findUserById(id);
        const isValidPass = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPass) {
            throw ApiError.badRequest("Wrong password!")
        } else return {
            status: true,
            message: 'Password confirmed'
        }
    }

    async updatePassword(password, id) {
        if (!password) {
            throw ApiError.badRequest("No data!")
        }
        const user = await findUserById(id);

        const isValidPass = await bcrypt.compare(password, user.passwordHash);
        if (isValidPass) {
            throw ApiError.badRequest("The same password!")
        }
        const passwordHash = await createPasswordHash(password);

        const updatedUser = await UserModel.findOneAndUpdate(
            { _id: id },
            { passwordHash },
            { returnDocument: 'after' },
        );
        if (!updatedUser) {
            throw ApiError.forbidden("Modified forbidden")
        } else return {
            status: true,
            message: `User ${updatedUser.userName} successfully updated`
        }
    }

    async updateProfile(body, id) {
        if (!body) {
            throw ApiError.badRequest("No data!")
        }
        const { userName, email, address } = body;

        const updatedUser = await UserModel.findOneAndUpdate(
            { _id: id },
            {
                $set: {
                    userName,
                    email,
                    address,
                }
            },
            { returnDocument: 'after' },
        );
        if (!updatedUser) {
            throw ApiError.forbidden("Modified forbidden")
        } else return {
            user: updatedUser,
            message: `User ${updatedUser.userName} successfully updated`
        };
    }

    async deleteUser(_id) {
        await findUserById(_id);
        
        const orderStatus = await OrderModel.deleteMany({ userId: _id });
        const userStatus = await UserModel.deleteOne({ _id });

        return { orderStatus, userStatus };
    }
}

export default new UserService;