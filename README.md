# Nimiq Vote

> This is the official webapp used for votings with the Nimiq Community at [nimiq.com/vote](https://nimiq.com/vote).

Feel free to use the code and send PRs to improve it!

You can find all the details on how to join the Nimiq Community and talk with devs, traders, and fellow Nimions [here](https://nimiq.com/community).

New to Nimiq? Check out [nimiq.com](https://nimiq.com).

## How to compile and run the code locally

This app was built with this the [Nimiq App Starter Kit](https://github.com/nimiq/app-starter-kit). It's using Vue.js, TypeScript, Pug, Stylus, and a bit of magic.

### Basic Setup

Add the app starter kit to your project:
```bash
git remote add starter-kit git@github.com:nimiq/app-starter-kit.git
git fetch starter-kit
```

Then merge it into your code base:
```bash
git merge --allow-unrelated-histories starter-kit/master
```

## Build and run

To get started, setup everything and get all dependencies with yarn:

```bash
yarn install
```

Run a development server that watches the project files,
compiles them on demand and hot-reloads the changes to keep your browser in sync:

```bash
yarn serve
```

Lint your code and automatically fix lint errors:

```bash
yarn lint
```

Compile and minify the project to be ready for deployment in production:

```bash
yarn build
```

## Contribute

Please feel free to [get in touch](https://www.nimiq.com/community/) and send PRs!
