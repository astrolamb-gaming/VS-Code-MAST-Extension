"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showNotification = showNotification;
function showNotification(message, type) {
    switch (type) {
        case NotificationType.ERROR:
            break;
        case NotificationType.WARNING:
            break;
        case NotificationType.NOTIFICATION:
            //window.showNotificationMessage()
            break;
        default:
            throw new Error("NotificationType is not valid!");
    }
}
var NotificationType;
(function (NotificationType) {
    NotificationType[NotificationType["NOTIFICATION"] = 0] = "NOTIFICATION";
    NotificationType[NotificationType["WARNING"] = 1] = "WARNING";
    NotificationType[NotificationType["ERROR"] = 2] = "ERROR";
})(NotificationType || (NotificationType = {}));
//# sourceMappingURL=notifications.js.map