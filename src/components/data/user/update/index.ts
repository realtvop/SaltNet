import {
    updateUserWithWorker,
    checkLoginWithWorker,
    clearIllegalTicketsWithWorker,
    previewStockedTicketsWithWorker,
} from "./updateUser";

export const updateUser = updateUserWithWorker;
export const checkLogin = checkLoginWithWorker;
export const clearIllegalTickets = clearIllegalTicketsWithWorker;
export const previewStockedTickets = previewStockedTicketsWithWorker;
