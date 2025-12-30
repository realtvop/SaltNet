/// <reference types="vite/client" />

// Vite worker inline import type declaration
declare module "*?worker&inline" {
    const workerConstructor: {
        new (): Worker;
    };
    export default workerConstructor;
}
