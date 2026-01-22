import {
    updateUserWithWorker,
    checkLoginWithWorker,
    clearIllegalTicketsWithWorker,
    previewStockedTicketsWithWorker,
    uploadScoresToSaltNet,
} from "./updateUser";

export const updateUser = updateUserWithWorker;
export const checkLogin = checkLoginWithWorker;
export const clearIllegalTickets = clearIllegalTicketsWithWorker;
export const previewStockedTickets = previewStockedTicketsWithWorker;
export { uploadScoresToSaltNet };
