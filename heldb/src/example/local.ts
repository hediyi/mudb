import HelFloat64 = require('helschema/float64');
import HelStruct = require('helschema/struct');
import HelDictionary = require('helschema/dictionary');
import { createSocketServer, createSocket } from 'helnet';
import createClient = require('../client');
import createServer = require('../server');

const Entity = HelStruct({
    x: HelFloat64(),
    y: HelFloat64(),
});

const protocol = {
    client: {
        state: Entity,
        message: {},
        rpc: {},
    },
    server: {
        state: HelDictionary(Entity),
        message: { },
        rpc: {},
    },
};

const socketServer = createSocketServer({
    local: {},
});

const server = createServer({
    protocol,
    socketServer,
});

server.start({
    message: {
    },
    rpc: {
    },
    ready() {
    },
    connect(client) {
        server.state[client.sessionId] = client.schema.clone(client.state);
        server.commit();
    },
    state(client) {
        const serverEntity = server.state[client.sessionId];
        const clientEntity = client.state;
        serverEntity.x = clientEntity.x;
        serverEntity.y = clientEntity.y;
        server.commit();
    },
    disconnect(client) {
        delete server.state[client.sessionId];
        server.commit();
    },
});

function startClient () {
    const socket = createSocket({
        sessionId: Math.random() + 'client',
        local: {
            server: socketServer,
        },
    });

    const client = createClient({
        protocol,
        socket,
    });

    const container = document.createElement('div');
    container.style.position = 'static';
    container.style.display = 'inline';

    const closeButton = document.createElement('input');
    closeButton.type = 'button';
    closeButton.value = 'x';
    closeButton.style.position = 'absolute';
    closeButton.addEventListener('click', () => client.close());
    container.appendChild(closeButton);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    container.appendChild(canvas);

    document.body.appendChild(container);

    function draw () {
        if (!context) {
            return;
        }
        context.fillStyle = '#000';
        context.fillRect(0, 0, 256, 256);

        const state = client.server.state;
        Object.keys(state).forEach((name) => {
            if (name === client.sessionId) {
                return;
            }

            const entity = state[name];

            context.fillStyle = '#fff';
            context.fillRect(entity.x - 2.5, entity.y - 2.5, 5, 5);
        });

        context.fillStyle = '#f00';
        context.fillRect(client.state.x - 3, client.state.y - 3, 6, 6);

        requestAnimationFrame(draw);
    }

    client.start({
        message: {
        },
        rpc: {
        },
        ready (err?:any) {
            if (err) {
                return;
            }
            canvas.addEventListener('mousemove', (ev) => {
                const bounds = canvas.getBoundingClientRect();
                client.state.x = ev.clientX - bounds.left;
                client.state.y = ev.clientY - bounds.top;
                client.commit();
            });
            draw();
        },
        state () {
        },
        close () {
            document.body.removeChild(container);
        },
    });
}

const addClientButton = document.createElement('input');
addClientButton.value = 'add client';
addClientButton.type = 'button';
addClientButton.addEventListener('click', startClient);

const clientButtonContainer = document.createElement('div');
clientButtonContainer.appendChild(addClientButton);

document.body.appendChild(clientButtonContainer);