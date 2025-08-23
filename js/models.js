window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
        if (properties.model) {
            clearTimeout(timer);
            timer = 0;
            document.getElementsByClassName('model')[0].innerHTML = '';
            model = properties.model.value;
            balanceSpeed(model);
            generate(model);
        }
        if (properties.color) {
            newColor = properties.color.value.split(' ').map(function (c) {
                return Math.ceil(c * 255);
            });
            document.getElementsByClassName('model')[0].style.color = `rgb(${newColor})`;
        }
        if (properties.backgroundcolor) {
            newColor = properties.backgroundcolor.value.split(' ').map(function (c) {
                return Math.ceil(c * 255);
            });
            document.getElementsByClassName('bg')[0].style.backgroundColor = `rgb(${newColor})`;
        }
        if (properties.animationspeed) {
            basedAnimationSpeed = properties.animationspeed.value;
            balanceSpeed(model);
        }
        if (properties.size) {
            document.getElementsByClassName('model')[0].style.fontSize = `${properties.size.value}px`;
        }
        if (properties.stopanimation){
            clearTimeout(timer);
            timer = 0;
            if (properties.stopanimation.value) {
                stopA = true;
            }
            else {
                stopA = false;
                document.getElementsByClassName('model')[0].innerHTML = '';
                generate(model);
            }
        }
    },
};

// 0 - donut; 1 - earth; 2 - skeleton; 3 - heartbeat
let model = 0;
let animationSpeed = 50;
let basedAnimationSpeed = 50;
let stopA = false;
let timer;

generate(model);

function balanceSpeed(model) {
    if (model == 2 || model == 3)
        animationSpeed = basedAnimationSpeed * 2;
    else
        animationSpeed = basedAnimationSpeed;
}

function generate(model) {
    let i = 0;
    let A = 1, B = 1;
    if (model == 0) {
        // Based on this code: https://www.a1k0n.net/js/donut.js
        function generateFrame() {
            let b = [];
            let z = [];
            A += 0.07;
            B += 0.03;
            let cA = Math.cos(A), sA = Math.sin(A),
                cB = Math.cos(B), sB = Math.sin(B);
            for (let k = 0; k < 1760; k++) {
                b[k] = k % 80 == 79 ? "\n" : " ";
                z[k] = 0;
            }
            for (let j = 0; j < 6.28; j += 0.07) {
                let ct = Math.cos(j), st = Math.sin(j);
                for (i = 0; i < 6.28; i += 0.02) {
                    let sp = Math.sin(i), cp = Math.cos(i), h = ct + 2,
                        D = 1 / (sp * h * sA + st * cA + 5),
                        t = sp * h * cA - st * sA;
                    let x = 0 | (40 + 30 * D * (cp * h * cB - t * sB)),
                        y = 0 | (12 + 15 * D * (cp * h * sB + t * cB)),
                        o = x + 80 * y,
                        N = 0 | (8 * ((st * sA - sp * ct * cA) * cB - sp * ct * sA - st * cA - cp * ct * sB));
                    if (y < 22 && y >= 0 && x >= 0 && x < 79 && D > z[o]) {
                        z[o] = D;
                        b[o] = ".,-~:;=!*#$@"[N > 0 ? N : 0];
                    }
                }
            }
            document.getElementsByClassName('model')[0].innerHTML = b.join("");
        };

        function timeoutRender() {
            generateFrame();
            if(!stopA)
                timer = setTimeout(timeoutRender, animationSpeed);
        };
        timeoutRender();
    }
    else {
        let ASCIIModel;
        function generateFrame() {
            let tmpModel = model;
            if (tmpModel == 1)
                ASCIIModel = earthASCII;
            if (tmpModel == 2)
                ASCIIModel = skeletonASCII;
            if (tmpModel == 3)
                ASCIIModel = heartASCII;
            document.getElementsByClassName('model')[0].innerHTML = ASCIIModel[i];
            i++;
            if (i >= ASCIIModel.length)
                i = 0;
        }

        function timeoutRender() {
            generateFrame();
            if(!stopA)
                timer = setTimeout(timeoutRender, animationSpeed);
        };
        timeoutRender();
    }
};