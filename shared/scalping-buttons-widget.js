/** @decorator */

import { WidgetWithInstrument } from './widget-with-instrument.js';
import { ref } from './element/templating/ref.js';
import { html, requireComponent } from './template.js';
import { WIDGET_TYPES } from './const.js';
import { observable } from './element/observation/observable.js';
import { validate } from './validate.js';
import { later } from './later.js';
import { repeat } from './element/templating/repeat.js';
import ppp from '../ppp.js';

await Promise.all([
  requireComponent('ppp-widget-radio-box-group'),
  requireComponent('ppp-widget-button')
]);

const defaultBuySideButtonsTemplate = `+1,+2,+5,+10
-1,-2,-5,-10`;
const defaultSellSideButtonsTemplate = `+1,+2,+5,+10
-1,-2,-5,-10`;

export const scalpingButtonsWidgetTemplate = (context, definition) => html`
  <template>
    <div class="widget-root">
      <div class="widget-header">
        <div class="widget-instrument-area">
          <${'ppp-widget-group-control'}
            :widget="${(x) => x}"
            selection="${(x) => x.document?.group}"
            ${ref('groupControl')}
          ></ppp-widget-group-control>
          <div class="instrument-search-holder">
            <${'ppp-widget-search-control'}
              :widget="${(x) => x}"
              ${ref('searchControl')}
            ></ppp-widget-search-control>
          </div>
          <div class="widget-header-name"
               title="${(x) => x.document?.name ?? ''}">
            <span>${(x) => x.document?.name ?? ''}</span>
          </div>
          <div class="widget-header-controls">
            <img
              draggable="false"
              alt="Закрыть"
              class="widget-close-button"
              src="static/widgets/close.svg"
              @click="${(x) => x.close()}"
            />
          </div>
        </div>
      </div>
      <div class="widget-body">
        <div class="scalping-buttons-widget-controls">
          <div class="scalping-buttons-widget-tabs">
            <ppp-widget-radio-box-group
              class="order-type-selector"
              @change="${(x) => x.handleOrderTypeChange()}"
              value="${(x) => x.document.activeTab ?? 'all'}"
              ${ref('orderTypeSelector')}
            >
              <ppp-widget-box-radio value="all">Все</ppp-widget-box-radio>
              <ppp-widget-box-radio value="limit"
              >Лимитные
              </ppp-widget-box-radio>
              <ppp-widget-box-radio
                value="stop"
                disabled
              >
                Отложенные
              </ppp-widget-box-radio>
            </ppp-widget-radio-box-group>
          </div>
        </div>
        <div class="scalping-buttons-widget-holder">
          <div
            class="scalping-buttons-widget-holder-buy"
            @click="${(x, c) => x.handleBuySellButtonClick(c, 'buy')}"
          >
            ${repeat(
              (x) =>
                (
                  x.document.buySideButtonsTemplate ??
                  defaultBuySideButtonsTemplate
                )?.split(/\r?\n/),
              html`
                <div class="${(x) => (x?.trim() ? '' : 'empty')}">
                  ${repeat(
                    (x) => x?.split(',').filter((i) => i),
                    html`
                      <ppp-widget-button appearance="success">
                        ${(x) => {
                          const n = parseInt(x).toString();

                          if (isNaN(n)) return '0';

                          if (n > 0) return `+${n}`;
                          else return n;
                        }}
                      </ppp-widget-button>
                    `
                  )}
                </div>
              `
            )}
          </div>
          <div
            class="scalping-buttons-widget-holder-sell"
            @click="${(x, c) => x.handleBuySellButtonClick(c, 'sell')}"
          >
            ${repeat(
              (x) =>
                (
                  x.document.sellSideButtonsTemplate ??
                  defaultSellSideButtonsTemplate
                )?.split(/\r?\n/),
              html`
                <div class="${(x) => (x?.trim() ? '' : 'empty')}">
                  ${repeat(
                    (x) => x?.split(',').filter((i) => i),
                    html`
                      <ppp-widget-button appearance="danger">
                        ${(x) => {
                          const n = parseInt(x).toString();

                          if (isNaN(n)) return '0';

                          if (n > 0) return `+${n}`;
                          else return n;
                        }}
                      </ppp-widget-button>
                    `
                  )}
                </div>
              `
            )}
          </div>
        </div>
        <${'ppp-widget-notifications-area'}
          ${ref('notificationsArea')}
        ></ppp-widget-notifications-area>
      </div>
    </div>
  </template>
`;

export class PppScalpingButtonsWidget extends WidgetWithInstrument {
  @observable
  ordersTrader;

  #buttons;

  async connectedCallback() {
    super.connectedCallback();

    this.ordersTrader = await ppp.getOrCreateTrader(this.document.ordersTrader);
    this.searchControl.trader = this.ordersTrader;
  }

  handleOrderTypeChange() {
    void this.applyChanges({
      $set: {
        'widgets.$.activeTab': this.orderTypeSelector.value
      }
    });
  }

  async handleBuySellButtonClick({ event }, side) {
    if (typeof this.ordersTrader?.modifyLimitOrders === 'function') {
      const button = event
        .composedPath()
        .find((n) => n.tagName?.toLowerCase?.() === 'ppp-widget-button');

      if (button) {
        const value = parseInt(button.textContent);

        if (value !== 0) {
          this.#buttons =
            this.#buttons ??
            Array.from(this.querySelectorAll('ppp-widget-button'));

          const coolDown = Math.abs(this.document.coolDown);

          try {
            this.topLoader.start();
            this.#buttons.forEach((b) => b.setAttribute('disabled', true));

            await this.ordersTrader.modifyLimitOrders({
              instrument: this.instrument,
              side,
              value
            });
          } catch (e) {
            console.error(e);

            this.notificationsArea.error({
              title: 'Скальперские кнопки',
              text: 'Не удалось переставить заявки.'
            });
          } finally {
            if (coolDown > 0) {
              await later(coolDown);
            }

            this.#buttons.forEach((b) => b.removeAttribute('disabled'));
            this.topLoader.stop();
          }
        }
      }
    }
  }

  async validate() {
    await validate(this.container.ordersTraderId);

    if (this.container.coolDown.value) {
      await validate(this.container.coolDown, {
        hook: async (value) => +value >= 0 && +value <= 5000,
        errorMessage: 'Введите значение в диапазоне от 0 до 5000'
      });
    }

    await validate(this.container.buySideButtonsTemplate);
    await validate(this.container.sellSideButtonsTemplate);
  }

  async update() {
    return {
      $set: {
        ordersTraderId: this.container.ordersTraderId.value,
        coolDown: this.container.coolDown.value,
        buySideButtonsTemplate: this.container.buySideButtonsTemplate.value,
        sellSideButtonsTemplate: this.container.sellSideButtonsTemplate.value
      }
    };
  }
}

export async function widgetDefinition(definition = {}) {
  await requireComponent('ppp-codeflask');

  return {
    type: WIDGET_TYPES.SCALPING_BUTTONS,
    collection: 'PPP',
    title: html`Скальперские кнопки`,
    description: html`<span class="positive">Скальперские кнопки</span>
      позволяют быстро модифицировать лимитные и отложенные заявки на заданное
      количество шагов цены.`,
    customElement: PppScalpingButtonsWidget.compose(definition),
    maxHeight: 512,
    maxWidth: 1900,
    minHeight: 120,
    defaultHeight: 160,
    minWidth: 275,
    settings: html`
      <div class="widget-settings-section">
        <div class="widget-settings-label-group">
          <h5>Трейдер заявок</h5>
          <p>Трейдер, который будет переставлять заявки.</p>
        </div>
        <ppp-collection-select
          ${ref('ordersTraderId')}
          value="${(x) => x.document.ordersTraderId}"
          :context="${(x) => x}"
          :preloaded="${(x) => x.document.ordersTrader ?? ''}"
          :query="${() => {
            return (context) => {
              return context.services
                .get('mongodb-atlas')
                .db('ppp')
                .collection('traders')
                .find({
                  $or: [
                    { removed: { $ne: true } },
                    { _id: `[%#this.document.ordersTraderId ?? ''%]` }
                  ]
                })
                .sort({ updatedAt: -1 });
            };
          }}"
          :transform="${() => ppp.decryptDocumentsTransformation()}"
        ></ppp-collection-select>
      </div>
      <div class="widget-settings-section">
        <div class="widget-settings-label-group">
          <h5>Задержка после использования кнопок</h5>
          <p>В течение этого времени после нажатия кнопка будет недоступна.
            Указывается в миллисекундах.</p>
        </div>
        <div class="widget-settings-input-group">
          <${'ppp-text-field'}
            optional
            type="number"
            placeholder="1000"
            value="${(x) => x.document.coolDown}"
            ${ref('coolDown')}
          ></ppp-text-field>
        </div>
      </div>
      <div class="widget-settings-section">
        <div class="widget-settings-label-group">
          <h5>Кнопки для заявок на покупку</h5>
          <p>
            Перечислите значения (со знаком) кнопок через запятую. Для создания
            нового ряда выполните перенос строки. Чтобы сделать отступ, оставьте
            очередную строку пустой. Значения задаются в шагах цены торгового
            инструмента.
          </p>
        </div>
        <div class="widget-settings-input-group">
          <ppp-codeflask
            :code="${(x) =>
              x.document.buySideButtonsTemplate ??
              defaultBuySideButtonsTemplate}"
            ${ref('buySideButtonsTemplate')}
          ></ppp-codeflask>
          <${'ppp-button'}
            class="margin-top"
            @click="${(x) => {
              x.buySideButtonsTemplate.updateCode(
                defaultBuySideButtonsTemplate
              );

              x.buySideButtonsTemplate.$emit('input');
            }}"
            appearance="primary"
          >
            Восстановить значение по умолчанию
          </ppp-button>
        </div>
      </div>
      <div class="widget-settings-section">
        <div class="widget-settings-label-group">
          <h5>Кнопки для заявок на продажу</h5>
        </div>
        <div class="widget-settings-input-group">
          <ppp-codeflask
            :code="${(x) =>
              x.document.sellSideButtonsTemplate ??
              defaultSellSideButtonsTemplate}"
            ${ref('sellSideButtonsTemplate')}
          ></ppp-codeflask>
          <${'ppp-button'}
            class="margin-top"
            @click="${(x) => {
              x.sellSideButtonsTemplate.updateCode(
                defaultSellSideButtonsTemplate
              );

              x.sellSideButtonsTemplate.$emit('input');
            }}"
            appearance="primary"
          >
            Восстановить значение по умолчанию
          </ppp-button>
        </div>
      </div>
    `
  };
}
