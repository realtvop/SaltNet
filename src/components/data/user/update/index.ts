import {
    updateUserWithWorker,
    checkLoginWithWorker,
    clearIllegalTicketsWithWorker,
    previewStockedTicketsWithWorker,
    hasPendingUserUpdates,
    cancelPendingUserUpdates,
} from "./updateUser";

export const updateUser = updateUserWithWorker;
export const checkLogin = checkLoginWithWorker;
export const clearIllegalTickets = clearIllegalTicketsWithWorker;
export const previewStockedTickets = previewStockedTicketsWithWorker;
export { hasPendingUserUpdates, cancelPendingUserUpdates };
