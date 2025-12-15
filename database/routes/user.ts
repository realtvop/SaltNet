export function user(app: any) {
    return app.get("/", () => "hi");
}
